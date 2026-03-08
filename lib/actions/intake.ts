"use server";

import { createClient } from "@/lib/supabase/server";
import { intakeSchema, type IntakeInput } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";

export type IntakeResult =
  | { success: true; batchId: string; weightWarning?: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Server Action: Node 03 — Refinery Intake Verification
 * Confirms intake weight. DB trigger handles weight reconciliation and auto-flagging.
 */
export async function intakeAction(input: IntakeInput): Promise<IntakeResult> {
  try {
    // 1. Validate input with Zod
    const parsed = intakeSchema.safeParse(input);
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

    // 3. Verify user role is 'refinery'
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return { success: false, error: "Profile not found" };
    }

    if (profile.role !== "refinery") {
      return { success: false, error: "Unauthorized: only refineries can confirm intake" };
    }

    // 4. Rate limit: 30 intakes per hour
    const rateLimitResult = await rateLimit(`intake:${user.id}`, 30, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return {
        success: false,
        error: "Rate limit exceeded. Please try again later.",
      };
    }

    // 5. Verify batch exists and status is NODE_02_APPROVED
    const { data: batch, error: batchError } = await supabase
      .from("gold_batches")
      .select("id, batch_id, status, declared_weight_kg")
      .eq("id", data.batch_id)
      .single();

    if (batchError || !batch) {
      return { success: false, error: "Batch not found" };
    }

    if (batch.status !== "NODE_02_APPROVED") {
      return {
        success: false,
        error: "Batch is not ready for intake confirmation",
      };
    }

    // 6. Pre-check weight discrepancy (warn before DB trigger flags)
    let weightWarning: string | undefined;
    const declaredWeight = parseFloat(batch.declared_weight_kg);
    const discrepancy = Math.abs(data.intake_weight_kg - declaredWeight) / declaredWeight;
    if (discrepancy > 0.001) {
      weightWarning = `Weight discrepancy of ${(discrepancy * 100).toFixed(2)}% detected. Batch will be auto-flagged.`;
    }

    // 7. Insert batch_node (Node 03)
    // The DB trigger (check_weight_reconciliation) will handle:
    //   - Weight discrepancy check (>0.1% → auto-flag)
    //   - Batch status update
    const { error: nodeError } = await supabase.from("batch_nodes").insert({
      batch_id: data.batch_id,
      node_number: 3,
      officer_id: user.id,
      status: "CONFIRMED",
      tx_hash: "PENDING_FABRIC",
      data: {
        action: "INTAKE_CONFIRMED",
        intake_weight_kg: data.intake_weight_kg,
        declared_weight_kg: batch.declared_weight_kg,
      },
    });

    if (nodeError) {
      return { success: false, error: "Failed to create intake record. Please try again." };
    }

    return { success: true, batchId: batch.batch_id, weightWarning };
  } catch {
    return { success: false, error: "An unexpected error occurred. Please try again." };
  }
}
