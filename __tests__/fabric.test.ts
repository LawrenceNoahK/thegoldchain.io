import { describe, it, expect } from "vitest";
import {
  submitBatchNode,
  anchorAuditHash,
  queryBatchHistory,
  verifyTransaction,
} from "@/lib/fabric";

// These tests run in "stub" mode (no FABRIC_PEER_ENDPOINT set)
// They verify the deterministic TX hash generation and fallback behavior

describe("Fabric Bridge (stub mode)", () => {
  it("generates a valid TX hash for batch node submission", async () => {
    const result = await submitBatchNode({
      batchId: "GHB-2026-0001",
      nodeNumber: 1,
      officerId: "user-123",
      status: "CONFIRMED",
      data: { declared_weight_kg: 12.4 },
    });

    expect(result.stub).toBe(true);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.blockNumber).toBe(0);
    expect(result.timestamp).toBeTruthy();
  });

  it("generates unique TX hashes for different payloads", async () => {
    const result1 = await submitBatchNode({
      batchId: "GHB-2026-0001",
      nodeNumber: 1,
      officerId: "user-123",
      status: "CONFIRMED",
      data: {},
    });

    const result2 = await submitBatchNode({
      batchId: "GHB-2026-0002",
      nodeNumber: 1,
      officerId: "user-456",
      status: "CONFIRMED",
      data: {},
    });

    expect(result1.txHash).not.toBe(result2.txHash);
  });

  it("generates a valid TX hash for audit hash anchoring", async () => {
    const result = await anchorAuditHash({
      date: "2026-03-08",
      hash: "abc123def456",
      entryCount: 42,
    });

    expect(result.stub).toBe(true);
    expect(result.txHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("returns empty result for batch history query in stub mode", async () => {
    const result = await queryBatchHistory("GHB-2026-0001");

    expect(result.stub).toBe(true);
    expect(result.found).toBe(false);
    expect(result.nodes).toEqual([]);
  });

  it("validates well-formed TX hashes", async () => {
    const validHash = "0x" + "a".repeat(64);
    const result = await verifyTransaction(validHash);

    expect(result.stub).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("rejects malformed TX hashes", async () => {
    const result = await verifyTransaction("not-a-hash");

    expect(result.stub).toBe(true);
    expect(result.valid).toBe(false);
  });

  it("rejects short TX hashes", async () => {
    const result = await verifyTransaction("0xabc");

    expect(result.stub).toBe(true);
    expect(result.valid).toBe(false);
  });
});
