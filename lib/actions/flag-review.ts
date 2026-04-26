"use server";

import { createClient } from "@/lib/supabase/server";
import { flagReviewSchema, type FlagReviewInput } from "@/lib/validations";
import { rateLimit } from "@/lib/rate-limit";

export type FlagReviewResult =
  | { success: true; batchId: string; newStatus: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Server Action: FLAG Review — GoldBod officer resolves a flagged batch.
 * OVERRIDE: Moves batch back to PENDING (officer takes responsibility)
 * REJECT: Permanently marks batch as rejected
 * ESCALATE: Keeps FLAGGED status but adds escalation notes
 */
export async function flagReviewAction(input: FlagReviewInput): Promise<FlagReviewResult> {
  try {
    // 1. Validate input
    const parsed = flagReviewSchema.safeParse(input);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".");
        if (!fieldErrors[field]) fieldErrors[field] = [];
        fieldErrors[field].push(issue.message);
      }
      return { success: false, error: "Validation failed", fieldErrors };
    }

    const data = parsed.data;

    // 2. Get authenticated user
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // 3. Verify goldbod_officer role
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["goldbod_officer", "admin"].includes(profile.role)) {
      return { success: false, error: "Only GoldBod officers can review flagged batches" };
    }

    // 4. Rate limit
    const rateLimitResult = await rateLimit(`flag-review:${user.id}`, 30, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return { success: false, error: "Rate limit exceeded. Please try again later." };
    }

    // 5. Verify batch exists and is FLAGGED
    const { data: batch, error: batchError } = await supabase
      .from("gold_batches")
      .select("id, batch_id, status")
      .eq("id", data.batch_id)
      .single();

    if (batchError || !batch) {
      return { success: false, error: "Batch not found" };
    }

    if (batch.status !== "FLAGGED") {
      return { success: false, error: "Batch is not in FLAGGED status" };
    }

    // 6. Determine new status based on action
    let newStatus: string;
    switch (data.action) {
      case "OVERRIDE":
        newStatus = "PENDING";
        break;
      case "REJECT":
        newStatus = "REJECTED";
        break;
      case "ESCALATE":
        newStatus = "FLAGGED"; // stays flagged but with escalation record
        break;
    }

    // 7. Update batch status (skip for ESCALATE — status stays FLAGGED)
    if (data.action !== "ESCALATE") {
      const { error: updateError } = await supabase
        .from("gold_batches")
        .update({ status: newStatus })
        .eq("id", data.batch_id)
        .eq("status", "FLAGGED"); // Optimistic lock: only update if still FLAGGED

      if (updateError) {
        return { success: false, error: "Failed to update batch status" };
      }
    }

    // 8. Record flag review decision
    // Update existing Node 02 if it exists; otherwise insert new one
    const { data: existingNode02 } = await supabase
      .from("batch_nodes")
      .select("id")
      .eq("batch_id", data.batch_id)
      .eq("node_number", 2)
      .single();

    const reviewData = {
      action: `FLAG_${data.action}`,
      officer_notes: data.officer_notes,
      reviewed_at: new Date().toISOString(),
      original_status: "FLAGGED",
      new_status: newStatus,
    };

    const nodeError = existingNode02
      ? (await supabase
          .from("batch_nodes")
          .update({
            officer_id: user.id,
            status: data.action === "OVERRIDE" ? "CONFIRMED" : "FLAGGED",
            data: reviewData,
          })
          .eq("id", existingNode02.id)).error
      : (await supabase.from("batch_nodes").insert({
          batch_id: data.batch_id,
          node_number: 2,
          officer_id: user.id,
          status: data.action === "OVERRIDE" ? "CONFIRMED" : "FLAGGED",
          tx_hash: "PENDING_FABRIC",
          data: reviewData,
        })).error;

    if (nodeError) {
      return { success: false, error: "Failed to record review decision" };
    }

    return { success: true, batchId: batch.batch_id, newStatus };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}
