"use server";

import { createClient } from "@/lib/supabase/server";
import { approveSchema, type ApproveInput } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";

export type ApproveResult =
  | { success: true; batchId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Server Action: Node 02 — GoldBod Export Certification
 * Approves a batch after satellite verification passes.
 */
export async function approveAction(input: ApproveInput): Promise<ApproveResult> {
  try {
    // 1. Validate input with Zod
    const parsed = approveSchema.safeParse(input);
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

    // 3. Verify user role is 'goldbod_officer'
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: "Profile not found" };
    }

    if (profile.role !== "goldbod_officer") {
      return { success: false, error: "Unauthorized: only GoldBod officers can approve batches" };
    }

    // 4. Rate limit: 60 approvals per hour
    const rateLimitResult = rateLimit(`approve:${user.id}`, 60, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return {
        success: false,
        error: `Rate limit exceeded. Try again after ${new Date(rateLimitResult.resetAt).toISOString()}`,
      };
    }

    // 5. Verify batch exists and status is PENDING
    const { data: batch, error: batchError } = await supabase
      .from("gold_batches")
      .select("id, batch_id, status, declared_weight_kg, operator_id")
      .eq("id", data.batch_id)
      .single();

    if (batchError || !batch) {
      return { success: false, error: "Batch not found" };
    }

    if (batch.status !== "PENDING") {
      return { success: false, error: `Batch status is ${batch.status}, expected PENDING` };
    }

    // 6. Verify satellite check has passed
    const { data: satCheck, error: satError } = await supabase
      .from("satellite_checks")
      .select("overall_status")
      .eq("batch_id", data.batch_id)
      .single();

    if (satError || !satCheck) {
      return { success: false, error: "Satellite verification has not been completed for this batch" };
    }

    if (satCheck.overall_status !== "PASS") {
      return {
        success: false,
        error: `Satellite check status is ${satCheck.overall_status}. Must be PASS before approval.`,
      };
    }

    // 7. Get operator info for the node data
    const { data: operator } = await supabase
      .from("operators")
      .select("license_number")
      .eq("id", batch.operator_id)
      .single();

    // 8. Insert batch_node (Node 02)
    const { error: nodeError } = await supabase.from("batch_nodes").insert({
      batch_id: data.batch_id,
      node_number: 2,
      officer_id: user.id,
      status: "CONFIRMED",
      tx_hash: "PENDING_FABRIC",
      data: {
        action: "APPROVED",
        license_number: operator?.license_number ?? null,
        batch_weight_kg: batch.declared_weight_kg,
        assay_ref: data.assay_ref ?? null,
        export_permit: data.export_permit ?? null,
        officer_notes: data.officer_notes ?? null,
      },
    });

    if (nodeError) {
      return { success: false, error: nodeError.message || "Failed to create approval record" };
    }

    return { success: true, batchId: batch.batch_id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return { success: false, error: message };
  }
}
