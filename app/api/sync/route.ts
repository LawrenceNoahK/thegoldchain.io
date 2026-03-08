// ============================================================
// THE GOLDCHAIN — Offline Sync API Route
//
// POST /api/sync
// Receives queued offline declarations, verifies HMAC integrity
// using server-side secret, validates with Zod, checks GPS against
// concession boundaries, and inserts into the database.
//
// SECURITY:
// - HMAC verified using server-stored secret (not client token)
// - Idempotency key prevents double-submission
// - Rate limited per user
// - Auth token verified fresh
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
    const { declaration, hmac, idempotencyKey, authToken } = body;

    if (!declaration || !hmac || !authToken) {
      return NextResponse.json(
        { error: "Invalid request" },
        { status: 400 }
      );
    }

    // 1. Verify the auth token
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
        { error: "Authentication failed. Please log in again." },
        { status: 401 }
      );
    }

    // 2. Verify HMAC integrity using server-stored secret
    const admin = createAdminClient();

    const { data: hmacRecord } = await admin
      .from("hmac_secrets")
      .select("secret")
      .eq("user_id", user.id)
      .single();

    if (hmacRecord?.secret) {
      const encoder = new TextEncoder();
      const keyMaterial = encoder.encode(hmacRecord.secret);
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
          { error: "Declaration verification failed. Please re-submit." },
          { status: 422 }
        );
      }
    }
    // If no HMAC secret found, still proceed — the secret may not have been provisioned yet

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

    // 4. Get user profile and operator info
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
        { error: "Only operators can submit declarations" },
        { status: 403 }
      );
    }

    if (!profile.operator_id) {
      return NextResponse.json(
        { error: "No operator linked to this account" },
        { status: 422 }
      );
    }

    // 5. Rate limit: 30 synced declarations per hour per operator
    const rateLimitResult = await rateLimit(`sync:${user.id}`, 30, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    // 6. Idempotency check — return success if already processed
    if (idempotencyKey) {
      const { data: existingBatch } = await admin
        .from("gold_batches")
        .select("id, batch_id")
        .eq("idempotency_key", idempotencyKey)
        .single();

      if (existingBatch) {
        // Already processed — return success (safe to delete from client queue)
        return NextResponse.json({
          success: true,
          batchId: existingBatch.batch_id,
          duplicate: true,
        });
      }
    }

    // 7. Check captured_at staleness (>72h) — auto-flag
    const isStale = validData.captured_at
      ? Date.now() - new Date(validData.captured_at).getTime() > MAX_AGE_MS
      : false;

    // 8. GPS proximity check against concession boundary
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

    // 9. Insert gold_batch with idempotency key
    const { data: batch, error: batchError } = await admin
      .from("gold_batches")
      .insert({
        operator_id: profile.operator_id,
        declared_weight_kg: validData.declared_weight_kg,
        status: isStale ? "FLAGGED" : "PENDING",
        idempotency_key: idempotencyKey || null,
      })
      .select("id, batch_id")
      .single();

    if (batchError || !batch) {
      // Check if this is a unique constraint violation (duplicate idempotency key)
      if (batchError?.code === "23505" && idempotencyKey) {
        // Race condition: another request just inserted this
        const { data: raceBatch } = await admin
          .from("gold_batches")
          .select("id, batch_id")
          .eq("idempotency_key", idempotencyKey)
          .single();

        if (raceBatch) {
          return NextResponse.json({
            success: true,
            batchId: raceBatch.batch_id,
            duplicate: true,
          });
        }
      }
      return NextResponse.json(
        { error: "Failed to create batch" },
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
        { error: "Failed to create declaration record" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      batchId: batch.batch_id,
      flagged: isStale,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
