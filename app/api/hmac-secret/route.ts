// ============================================================
// THE GOLDCHAIN — HMAC Secret Provisioning API
//
// POST /api/hmac-secret
// Generates or rotates an HMAC secret for the authenticated user.
// The secret is stored in hmac_secrets table and fetched by the
// client via Supabase RLS for offline declaration signing.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { authToken } = body;

    if (!authToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Verify the auth token
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const userClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${authToken}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser(authToken);
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    // Generate a cryptographically random secret
    const secretBytes = new Uint8Array(32);
    crypto.getRandomValues(secretBytes);
    const secret = Array.from(secretBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Upsert into hmac_secrets
    const admin = createAdminClient();
    const { error: upsertError } = await admin
      .from("hmac_secrets")
      .upsert({
        user_id: user.id,
        secret,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }, {
        onConflict: "user_id",
      });

    if (upsertError) {
      return NextResponse.json({ error: "Failed to provision secret" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
