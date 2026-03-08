"use server";

import { createClient } from "@/lib/supabase/server";
import { declareSchema, type DeclareInput } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";

export type DeclareResult =
  | { success: true; batchId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Server Action: Node 01 — Mine Production Declaration
 * Creates a gold_batch and the first batch_node record.
 */
export async function declareAction(input: DeclareInput): Promise<DeclareResult> {
  try {
    // 1. Validate input with Zod
    const parsed = declareSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return {
        success: false,
        error: "Validation failed",
        fieldErrors,
      };
    }

    const data = parsed.data;

    // 2. Get authenticated user
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // 3. Verify user role is 'operator'
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, operator_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: "Profile not found" };
    }

    if (profile.role !== "operator") {
      return { success: false, error: "Unauthorized: only operators can submit declarations" };
    }

    if (!profile.operator_id) {
      return { success: false, error: "No operator linked to this account" };
    }

    // 4. Rate limit: 10 declarations per hour
    const rateLimitResult = await rateLimit(`declare:${user.id}`, 10, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return {
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      };
    }

    // 5. Insert gold_batch
    const { data: batch, error: batchError } = await supabase
      .from("gold_batches")
      .insert({
        operator_id: profile.operator_id,
        declared_weight_kg: data.declared_weight_kg,
      })
      .select("id, batch_id")
      .single();

    if (batchError || !batch) {
      return { success: false, error: "Failed to create batch. Please try again." };
    }

    // 6. Insert batch_node (Node 01)
    const { error: nodeError } = await supabase.from("batch_nodes").insert({
      batch_id: batch.id,
      node_number: 1,
      officer_id: user.id,
      status: "CONFIRMED",
      tx_hash: "PENDING_FABRIC",
      data: {
        gps_lat: data.gps_lat ?? null,
        gps_lng: data.gps_lng ?? null,
        field_notes: data.field_notes ?? null,
        declared_weight_kg: data.declared_weight_kg,
        captured_at: data.captured_at ?? null,
      },
      ...(data.captured_at ? { captured_at: data.captured_at } : {}),
    });

    if (nodeError) {
      return { success: false, error: "Failed to create declaration record. Please try again." };
    }

    return { success: true, batchId: batch.batch_id };
  } catch {
    return { success: false, error: "An unexpected error occurred. Please try again." };
  }
}
