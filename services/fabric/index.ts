/**
 * THE GOLDCHAIN — Fabric Service Bridge
 *
 * Re-exports from lib/fabric.ts for backward compatibility.
 * This module acts as the service boundary for Hyperledger Fabric integration.
 *
 * Usage in API routes or server actions:
 *   import { submitBatchNode, processPendingNodes } from "@/services/fabric";
 */

export {
  submitBatchNode,
  anchorAuditHash,
  queryBatchHistory,
  verifyTransaction,
  updateNodeTxHash,
  processPendingNodes,
  type FabricTxResult,
  type BatchNodePayload,
  type AuditHashPayload,
} from "@/lib/fabric";
