"use server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";
import { submitBatchNode } from "@/lib/fabric";
import crypto from "crypto";

export type CertifyResult =
  | { success: true; batchId: string; certificateId: string }
  | { success: false; error: string };

/**
 * Generate SHA-256 audit trail hash from all node data.
 * This hash is written to the CSDDD certificate and (eventually) to Hyperledger Fabric.
 */
function generateAuditTrailHash(batchData: {
  batch_id: string;
  declared_weight_kg: number;
  nodes: { node_number: number; tx_hash: string; timestamp: string; data: any }[];
}): string {
  const payload = JSON.stringify({
    batch_id: batchData.batch_id,
    declared_weight_kg: batchData.declared_weight_kg,
    nodes: batchData.nodes
      .sort((a, b) => a.node_number - b.node_number)
      .map((n) => ({
        node_number: n.node_number,
        tx_hash: n.tx_hash,
        timestamp: n.timestamp,
        data: n.data,
      })),
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * Server Action: Node 04 — CSDDD Certificate Generation
 *
 * Triggered when Node 03 (refinery intake) is confirmed.
 * Generates a CSDDD compliance certificate with:
 * - Full audit trail hash (SHA-256 of all node data)
 * - All 3 node TX hashes
 * - Batch status set to CERTIFIED
 */
export async function certifyAction(input: { batch_id: string }): Promise<CertifyResult> {
  try {
    const batchId = input.batch_id;
    if (!batchId || typeof batchId !== "string") {
      return { success: false, error: "Invalid batch ID" };
    }

    // 1. Auth — must be admin or system (in production, this would be automated)
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    // Allow goldbod_officer or admin to trigger cert generation
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["goldbod_officer", "admin"].includes(profile.role)) {
      return { success: false, error: "Only GoldBod officers or admins can generate certificates" };
    }

    // 2. Rate limit
    const rateLimitResult = await rateLimit(`certify:${user.id}`, 30, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return { success: false, error: "Rate limit exceeded" };
    }

    // 3. Fetch batch with all nodes
    const { data: batch, error: batchError } = await supabase
      .from("gold_batches")
      .select(`
        id, batch_id, declared_weight_kg, status,
        batch_nodes (id, node_number, status, tx_hash, timestamp, data)
      `)
      .eq("id", batchId)
      .single();

    if (batchError || !batch) {
      return { success: false, error: "Batch not found" };
    }

    // 4. Verify batch is ready for certification
    // Must have confirmed nodes 1, 2, and 3
    const nodes = (batch.batch_nodes || []) as any[];
    const confirmedNodes = new Set(
      nodes
        .filter((n: any) => n.status === "CONFIRMED")
        .map((n: any) => n.node_number)
    );

    if (!confirmedNodes.has(1)) {
      return { success: false, error: "Node 01 (Mine Declaration) not confirmed" };
    }
    if (!confirmedNodes.has(2)) {
      return { success: false, error: "Node 02 (GoldBod Certification) not confirmed" };
    }
    if (!confirmedNodes.has(3)) {
      return { success: false, error: "Node 03 (Refinery Intake) not confirmed" };
    }

    // 5. Check batch status allows certification
    if (batch.status === "CERTIFIED") {
      return { success: false, error: "Batch is already certified" };
    }
    if (batch.status === "FLAGGED") {
      return { success: false, error: "Cannot certify a flagged batch" };
    }
    if (batch.status === "REJECTED") {
      return { success: false, error: "Cannot certify a rejected batch" };
    }

    // Check no existing certificate
    const { data: existingCert } = await supabase
      .from("csddd_certificates")
      .select("id")
      .eq("batch_id", batchId)
      .single();

    if (existingCert) {
      return { success: false, error: "Certificate already exists for this batch" };
    }

    // 6. Get TX hashes for each node
    const getNodeTx = (nodeNum: number) => {
      const node = nodes.find((n: any) => n.node_number === nodeNum && n.status === "CONFIRMED");
      return node?.tx_hash || "PENDING_FABRIC";
    };

    // 6b. Verify all TX hashes are populated (not PENDING_FABRIC)
    for (let i = 1; i <= 3; i++) {
      if (getNodeTx(i) === "PENDING_FABRIC") {
        return { success: false, error: `Node ${String(i).padStart(2, "0")} TX hash is still pending — retry after Fabric processing` };
      }
    }

    // 7. Generate audit trail hash
    const auditTrailHash = generateAuditTrailHash({
      batch_id: batch.batch_id,
      declared_weight_kg: batch.declared_weight_kg,
      nodes: nodes.filter((n: any) => n.status === "CONFIRMED"),
    });

    // 8. Submit Node 04 to Fabric and insert
    const node4Data = {
      action: "CSDDD_CERTIFICATE_ISSUED",
      audit_trail_hash: auditTrailHash,
      node_1_tx: getNodeTx(1),
      node_2_tx: getNodeTx(2),
      node_3_tx: getNodeTx(3),
      issued_at: new Date().toISOString(),
    };

    const fabricResult = await submitBatchNode({
      batchId: batch.batch_id,
      nodeNumber: 4,
      officerId: user.id,
      status: "CONFIRMED",
      data: node4Data,
    });

    const { error: nodeError } = await supabase.from("batch_nodes").insert({
      batch_id: batchId,
      node_number: 4,
      officer_id: user.id,
      status: "CONFIRMED",
      tx_hash: fabricResult.txHash,
      data: node4Data,
    });

    if (nodeError) {
      return { success: false, error: "Failed to create certificate node" };
    }

    // 9. Create CSDDD certificate record
    // certificate_url and qr_code_url point to the public verify page
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const verifyUrl = `${baseUrl}/verify/${batch.batch_id}`;

    const { data: cert, error: certError } = await supabase
      .from("csddd_certificates")
      .insert({
        batch_id: batchId,
        certificate_url: verifyUrl,
        audit_trail_hash: auditTrailHash,
        qr_code_url: verifyUrl,
        node_1_tx: getNodeTx(1),
        node_2_tx: getNodeTx(2),
        node_3_tx: getNodeTx(3),
      })
      .select("id")
      .single();

    if (certError || !cert) {
      return { success: false, error: "Failed to create certificate record" };
    }

    // 10. Update batch status to CERTIFIED
    // Note: the update_batch_status trigger may have already set this when Node 04 was inserted.
    // We attempt the update but don't fail if no rows matched (trigger already handled it).
    const { error: updateError } = await supabase
      .from("gold_batches")
      .update({ status: "CERTIFIED" })
      .eq("id", batchId)
      .in("status", ["NODE_03_CONFIRMED", "CERTIFIED"]);

    if (updateError) {
      return { success: false, error: "Failed to update batch status" };
    }

    return {
      success: true,
      batchId: batch.batch_id,
      certificateId: cert.id,
    };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}
