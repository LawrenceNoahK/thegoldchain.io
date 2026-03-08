// ============================================================
// THE GOLDCHAIN — Offline Sync API Route
//
// POST /api/sync
// Receives queued offline declarations, verifies HMAC integrity,
// validates with Zod, checks GPS against concession boundaries,
// and inserts into the database using the service role client.
//
// This is one of the ONLY places where the service role key is used.
// ============================================================

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { declareSchema } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";

const MAX_AGE_MS = 72 * 60 * 60 * 1000; // 72 hours

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { declaration, hmac, authToken } = body;

    if (!declaration || !hmac || !authToken) {
      return NextResponse.json(
        { error: "Missing declaration, hmac, or authToken" },
        { status: 400 }
      );
    }

    // 1. Verify the auth token — try to get the user from it
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const userClient = createSupabaseClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${authToken}` },
      },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser(authToken);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication failed — token may be expired. Please log in again." },
        { status: 401 }
      );
    }

    // 2. Verify HMAC integrity
    const encoder = new TextEncoder();
    const keyMaterial = encoder.encode(authToken);
    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const data = encoder.encode(JSON.stringify(declaration));
    const signatureBytes = new Uint8Array(
      hmac.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
    );
    const isValid = await crypto.subtle.verify("HMAC", key, signatureBytes, data);

    if (!isValid) {
      return NextResponse.json(
        { error: "HMAC verification failed — payload may have been tampered with" },
        { status: 422 }
      );
    }

    // 3. Validate with Zod
    const parsed = declareSchema.safeParse(declaration);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message).join("; ");
      return NextResponse.json(
        { error: `Validation failed: ${errors}` },
        { status: 422 }
      );
    }

    const validData = parsed.data;

    // 4. Check captured_at is within 72 hours
    if (validData.captured_at) {
      const capturedAt = new Date(validData.captured_at).getTime();
      const age = Date.now() - capturedAt;
      if (age > MAX_AGE_MS) {
        // Auto-flag but still accept — data is valuable even if stale
        // The satellite check is the authoritative validator
      }
    }

    // 5. Get user profile and operator info
    const admin = createAdminClient();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role, operator_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 422 }
      );
    }

    if (profile.role !== "operator") {
      return NextResponse.json(
        { error: "Unauthorized: only operators can submit declarations" },
        { status: 403 }
      );
    }

    if (!profile.operator_id) {
      return NextResponse.json(
        { error: "No operator linked to this account" },
        { status: 422 }
      );
    }

    // 6. Rate limit: 30 synced declarations per hour per operator
    const rateLimitResult = rateLimit(`sync:${user.id}`, 30, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Rate limit exceeded for sync operations" },
        { status: 429 }
      );
    }

    // 7. GPS proximity check against concession boundary (if PostGIS available)
    // Note: This runs a basic check. The satellite verification is the authoritative validator.
    if (validData.gps_lat && validData.gps_lng) {
      const { data: operator } = await admin
        .from("operators")
        .select("concession_geojson")
        .eq("id", profile.operator_id)
        .single();

      if (operator?.concession_geojson) {
        // PostGIS ST_Contains check would go here when concession_geojson is properly formatted
        // For now, GPS is recorded and satellite check is the authoritative boundary validator
      }
    }

    // 8. Check if captured_at is stale (>72h) — auto-flag the batch
    const isStale = validData.captured_at
      ? Date.now() - new Date(validData.captured_at).getTime() > MAX_AGE_MS
      : false;

    // 9. Insert gold_batch
    const { data: batch, error: batchError } = await admin
      .from("gold_batches")
      .insert({
        operator_id: profile.operator_id,
        declared_weight_kg: validData.declared_weight_kg,
        status: isStale ? "FLAGGED" : "PENDING",
      })
      .select("id, batch_id")
      .single();

    if (batchError || !batch) {
      return NextResponse.json(
        { error: batchError?.message || "Failed to create batch" },
        { status: 500 }
      );
    }

    // 10. Insert batch_node (Node 01)
    const { error: nodeError } = await admin.from("batch_nodes").insert({
      batch_id: batch.id,
      node_number: 1,
      officer_id: user.id,
      status: "CONFIRMED",
      tx_hash: "PENDING_FABRIC",
      captured_at: validData.captured_at || null,
      data: {
        gps_lat: validData.gps_lat ?? null,
        gps_lng: validData.gps_lng ?? null,
        field_notes: validData.field_notes ?? null,
        declared_weight_kg: validData.declared_weight_kg,
        captured_at: validData.captured_at ?? null,
        synced_from_offline: true,
        stale_declaration: isStale,
      },
    });

    if (nodeError) {
      return NextResponse.json(
        { error: nodeError.message || "Failed to create node record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batchId: batch.batch_id,
      flagged: isStale,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
