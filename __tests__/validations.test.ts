import { describe, it, expect } from "vitest";
import {
  declareSchema,
  approveSchema,
  intakeSchema,
  loginSchema,
  flagReviewSchema,
} from "@/lib/validations";

// ── declareSchema ────────────────────────────────────────────

describe("declareSchema", () => {
  it("accepts valid declaration", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 12.4,
      gps_lat: 5.3,
      gps_lng: -2.0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts minimal declaration (weight only)", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects weight of 0", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative weight", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: -5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects weight over 10,000 kg", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 10001,
    });
    expect(result.success).toBe(false);
  });

  it("rejects weight with more than 4 decimal places", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 1.23456,
    });
    expect(result.success).toBe(false);
  });

  it("accepts weight with exactly 4 decimal places", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 1.2345,
    });
    expect(result.success).toBe(true);
  });

  it("rejects GPS latitude outside Ghana", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      gps_lat: 35.0, // North Carolina, not Ghana
      gps_lng: -2.0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects GPS longitude outside Ghana", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      gps_lat: 6.0,
      gps_lng: 10.0, // way east
    });
    expect(result.success).toBe(false);
  });

  it("accepts GPS at Ghana boundaries", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      gps_lat: 4.5,  // GHANA_LAT_MIN
      gps_lng: -3.3, // GHANA_LNG_MIN
    });
    expect(result.success).toBe(true);
  });

  it("rejects HTML in field notes", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      field_notes: "<script>alert('xss')</script>",
    });
    expect(result.success).toBe(false);
  });

  it("accepts clean field notes", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      field_notes: "Morning extraction from Pit B-7. Good conditions.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects field notes over 500 characters", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      field_notes: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid captured_at datetime", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      captured_at: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("accepts valid ISO captured_at", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: 5,
      captured_at: "2026-03-08T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-numeric weight", () => {
    const result = declareSchema.safeParse({
      declared_weight_kg: "five",
    });
    expect(result.success).toBe(false);
  });
});

// ── approveSchema ────────────────────────────────────────────

describe("approveSchema", () => {
  it("accepts valid approval with UUID", () => {
    const result = approveSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-UUID batch_id", () => {
    const result = approveSchema.safeParse({
      batch_id: "GHB-2026-0001",
    });
    expect(result.success).toBe(false);
  });

  it("accepts approval with optional fields", () => {
    const result = approveSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      assay_ref: "ASSAY-2026-001",
      export_permit: "EXP-GH-2026-001",
      officer_notes: "All clear",
    });
    expect(result.success).toBe(true);
  });

  it("rejects HTML in assay_ref", () => {
    const result = approveSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      assay_ref: "<img onerror=alert(1)>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects assay_ref over 100 characters", () => {
    const result = approveSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      assay_ref: "a".repeat(101),
    });
    expect(result.success).toBe(false);
  });
});

// ── intakeSchema ─────────────────────────────────────────────

describe("intakeSchema", () => {
  const validBatchId = "123e4567-e89b-12d3-a456-426614174000";

  it("accepts valid intake with GCR refinery", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "GCR",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid intake with EU refinery", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "EU",
    });
    expect(result.success).toBe(true);
  });

  it("accepts OTHER refinery with a name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      refinery_name: "Rand Refinery",
    });
    expect(result.success).toBe(true);
  });

  it("rejects OTHER with missing refinery_name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
    });
    expect(result.success).toBe(false);
  });

  it("rejects OTHER with empty refinery_name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      refinery_name: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects OTHER with whitespace-only refinery_name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      refinery_name: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects OTHER with null refinery_name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      refinery_name: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects GCR with stray refinery_name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "GCR",
      refinery_name: "Should not be here",
    });
    expect(result.success).toBe(false);
  });

  it("rejects EU with stray refinery_name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "EU",
      refinery_name: "Should not be here",
    });
    expect(result.success).toBe(false);
  });

  it("trims surrounding whitespace on refinery_name", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      refinery_name: "  Rand Refinery  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.refinery_name).toBe("Rand Refinery");
    }
  });

  it("strips control chars from refinery_name (zero-width, RTL override)", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      // U+200B zero-width space, U+202E RTL override
      refinery_name: "Rand​ Refinery‮",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.refinery_name).toBe("Rand Refinery");
    }
  });

  it("rejects refinery_name with disallowed chars (emoji, $, *)", () => {
    for (const bad of ["Rand $$$ Refinery", "Refinery*", "Rand 🏭"]) {
      const result = intakeSchema.safeParse({
        batch_id: validBatchId,
        intake_weight_kg: 12.39,
        refinery_type: "OTHER",
        refinery_name: bad,
      });
      expect(result.success, `should reject "${bad}"`).toBe(false);
    }
  });

  it("rejects lowercase refinery_type", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "gcr",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing refinery_type", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown refinery_type", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "DUBAI",
    });
    expect(result.success).toBe(false);
  });

  it("rejects refinery_name with HTML", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      refinery_name: "<script>alert(1)</script>",
    });
    expect(result.success).toBe(false);
  });

  it("rejects refinery_name over 100 chars", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 12.39,
      refinery_type: "OTHER",
      refinery_name: "x".repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing intake_weight_kg", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      refinery_type: "GCR",
    });
    expect(result.success).toBe(false);
  });

  it("rejects intake weight of 0", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 0,
      refinery_type: "GCR",
    });
    expect(result.success).toBe(false);
  });

  it("rejects intake weight over 10,000 kg", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 10001,
      refinery_type: "GCR",
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 4 decimal places", () => {
    const result = intakeSchema.safeParse({
      batch_id: validBatchId,
      intake_weight_kg: 1.23456,
      refinery_type: "GCR",
    });
    expect(result.success).toBe(false);
  });
});

// ── loginSchema ──────────────────────────────────────────────

describe("loginSchema", () => {
  it("accepts valid login", () => {
    const result = loginSchema.safeParse({
      email: "officer@goldchain.io",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = loginSchema.safeParse({
      email: "officer@goldchain.io",
      password: "12345",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing email", () => {
    const result = loginSchema.safeParse({
      password: "password123",
    });
    expect(result.success).toBe(false);
  });
});

// ── flagReviewSchema ─────────────────────────────────────────

describe("flagReviewSchema", () => {
  it("accepts valid OVERRIDE review", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "OVERRIDE",
      officer_notes: "Reviewed satellite data manually. Boundary flag was a false positive.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts REJECT action", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "REJECT",
      officer_notes: "Confirmed illegal mining activity outside concession boundary.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts ESCALATE action", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "ESCALATE",
      officer_notes: "Requires senior review. Ambiguous satellite imagery from rainy season cloud cover.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid action", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "APPROVE",
      officer_notes: "This is not a valid action for flag review.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes under 10 characters", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "OVERRIDE",
      officer_notes: "OK",
    });
    expect(result.success).toBe(false);
  });

  it("rejects notes over 1000 characters", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "OVERRIDE",
      officer_notes: "a".repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it("rejects HTML in officer notes", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "OVERRIDE",
      officer_notes: '<script>alert("xss")</script> override approved',
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing officer_notes", () => {
    const result = flagReviewSchema.safeParse({
      batch_id: "123e4567-e89b-12d3-a456-426614174000",
      action: "OVERRIDE",
    });
    expect(result.success).toBe(false);
  });
});
