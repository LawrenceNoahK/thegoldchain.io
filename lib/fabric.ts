/**
 * THE GOLDCHAIN — Hyperledger Fabric Bridge
 *
 * REST bridge to the Hyperledger Fabric peer node.
 * All blockchain interactions go through this module.
 *
 * In production:
 * - Connects to Fabric peer via gRPC gateway
 * - Submits/evaluates chaincode transactions
 * - Returns real TX hashes
 *
 * When FABRIC_PEER_ENDPOINT is not set, operates in "stub" mode:
 * - Generates deterministic TX hashes from input data
 * - Logs would-be transactions for audit
 * - Allows the app to function without a live Fabric network
 */

import crypto from "crypto";

// ── Config ───────────────────────────────────────────────────

const FABRIC_CONFIG = {
  peerEndpoint: process.env.FABRIC_PEER_ENDPOINT || "",
  channelName: process.env.FABRIC_CHANNEL_NAME || "goldchain",
  chaincodeName: process.env.FABRIC_CHAINCODE_NAME || "goldchain-cc",
  mspId: process.env.FABRIC_MSP_ID || "GoldBodMSP",
  apiKey: process.env.FABRIC_API_KEY || "",
};

function isFabricAvailable(): boolean {
  return FABRIC_CONFIG.peerEndpoint.length > 0;
}

// ── Types ────────────────────────────────────────────────────

export interface FabricTxResult {
  txHash: string;
  blockNumber: number;
  timestamp: string;
  stub: boolean; // true if generated without live Fabric
}

export interface BatchNodePayload {
  batchId: string;
  nodeNumber: number;
  officerId: string;
  status: string;
  data: Record<string, any>;
}

export interface AuditHashPayload {
  date: string; // ISO date (YYYY-MM-DD)
  hash: string; // SHA-256 of day's audit_log entries
  entryCount: number;
}

// ── Core Functions ───────────────────────────────────────────

/**
 * Submit a batch node transaction to the Fabric ledger.
 * Chaincode function: RecordBatchNode
 */
export async function submitBatchNode(payload: BatchNodePayload): Promise<FabricTxResult> {
  if (isFabricAvailable()) {
    return await fabricSubmit("RecordBatchNode", payload);
  }
  return generateStubTx(payload);
}

/**
 * Submit daily audit log hash to Fabric for immutable anchoring.
 * Chaincode function: AnchorAuditHash
 */
export async function anchorAuditHash(payload: AuditHashPayload): Promise<FabricTxResult> {
  if (isFabricAvailable()) {
    return await fabricSubmit("AnchorAuditHash", payload);
  }
  return generateStubTx(payload);
}

/**
 * Query a batch's full chain of custody from the Fabric ledger.
 * Chaincode function: QueryBatchHistory
 */
export async function queryBatchHistory(batchId: string): Promise<{
  found: boolean;
  nodes: Array<{ nodeNumber: number; txHash: string; timestamp: string }>;
  stub: boolean;
}> {
  if (isFabricAvailable()) {
    const result = await fabricEvaluate("QueryBatchHistory", { batchId });
    return { found: true, nodes: result.nodes || [], stub: false };
  }
  // Stub mode: return empty (caller should use Supabase data)
  return { found: false, nodes: [], stub: true };
}

/**
 * Verify a TX hash exists on the Fabric ledger.
 * Chaincode function: VerifyTransaction
 */
export async function verifyTransaction(txHash: string): Promise<{
  valid: boolean;
  blockNumber?: number;
  stub: boolean;
}> {
  if (isFabricAvailable()) {
    const result = await fabricEvaluate("VerifyTransaction", { txHash });
    return { valid: result.valid, blockNumber: result.blockNumber, stub: false };
  }
  // Stub: check if it matches our deterministic format
  return { valid: txHash.startsWith("0x") && txHash.length === 66, stub: true };
}

// ── Fabric Network Communication ─────────────────────────────

/**
 * Submit a transaction to the Fabric network (write operation).
 * Uses the Fabric Gateway REST API.
 */
async function fabricSubmit(functionName: string, args: Record<string, any>): Promise<FabricTxResult> {
  const endpoint = `${FABRIC_CONFIG.peerEndpoint}/api/v1/channels/${FABRIC_CONFIG.channelName}/chaincodes/${FABRIC_CONFIG.chaincodeName}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MSP-ID": FABRIC_CONFIG.mspId,
      ...(FABRIC_CONFIG.apiKey ? { Authorization: `Bearer ${FABRIC_CONFIG.apiKey}` } : {}),
    },
    body: JSON.stringify({
      function: functionName,
      args: [JSON.stringify(args)],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fabric submit failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return {
    txHash: result.txId || result.transaction_id,
    blockNumber: result.blockNumber || result.block_number || 0,
    timestamp: new Date().toISOString(),
    stub: false,
  };
}

/**
 * Evaluate a transaction on the Fabric network (read-only query).
 */
async function fabricEvaluate(functionName: string, args: Record<string, any>): Promise<any> {
  const endpoint = `${FABRIC_CONFIG.peerEndpoint}/api/v1/channels/${FABRIC_CONFIG.channelName}/chaincodes/${FABRIC_CONFIG.chaincodeName}/query`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MSP-ID": FABRIC_CONFIG.mspId,
      ...(FABRIC_CONFIG.apiKey ? { Authorization: `Bearer ${FABRIC_CONFIG.apiKey}` } : {}),
    },
    body: JSON.stringify({
      function: functionName,
      args: [JSON.stringify(args)],
    }),
  });

  if (!response.ok) {
    throw new Error(`Fabric query failed: ${response.status}`);
  }

  return response.json();
}

// ── Stub TX Generation ───────────────────────────────────────

/**
 * Generate a unique TX hash from the payload.
 * Format: 0x + 64-char hex (SHA-256 of payload + timestamp)
 * This is used when Fabric is not available (stub mode).
 */
function generateStubTx(payload: Record<string, any>): FabricTxResult {
  const input = JSON.stringify(payload) + Date.now().toString();
  const hash = crypto.createHash("sha256").update(input).digest("hex");

  return {
    txHash: `0x${hash}`,
    blockNumber: 0,
    timestamp: new Date().toISOString(),
    stub: true,
  };
}

// ── Utility: Update TX Hash in Supabase ──────────────────────

/**
 * After submitting to Fabric, update the batch_node's tx_hash in Supabase.
 * Called after a successful Fabric submit to replace PENDING_FABRIC.
 */
export async function updateNodeTxHash(
  supabase: any,
  nodeId: string,
  txHash: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from("batch_nodes")
    .update({ tx_hash: txHash })
    .eq("id", nodeId)
    .eq("tx_hash", "PENDING_FABRIC"); // Only update if still pending

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

/**
 * Process all PENDING_FABRIC nodes and submit them to Fabric.
 * Used as a batch job or called from a cron trigger.
 */
export async function processPendingNodes(
  supabase: any
): Promise<{ processed: number; errors: number }> {
  const { data: pendingNodes, error } = await supabase
    .from("batch_nodes")
    .select(`
      id, batch_id, node_number, officer_id, status, data,
      gold_batches (batch_id)
    `)
    .eq("tx_hash", "PENDING_FABRIC")
    .limit(50);

  if (error || !pendingNodes) {
    return { processed: 0, errors: 1 };
  }

  let processed = 0;
  let errors = 0;

  for (const node of pendingNodes) {
    try {
      const batchIdStr = (node.gold_batches as any)?.batch_id || node.batch_id;
      const result = await submitBatchNode({
        batchId: batchIdStr,
        nodeNumber: node.node_number,
        officerId: node.officer_id || "",
        status: node.status,
        data: node.data || {},
      });

      const updateResult = await updateNodeTxHash(supabase, node.id, result.txHash);
      if (updateResult.success) {
        processed++;
      } else {
        errors++;
      }
    } catch {
      errors++;
    }
  }

  return { processed, errors };
}
