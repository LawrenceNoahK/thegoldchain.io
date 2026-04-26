import { z } from "zod";

// ============================================================
// THE GOLDCHAIN — Zod Validation Schemas
// All mutation inputs must be validated through these schemas
// ============================================================

// Ghana approximate bounding box (used for GPS sanity checks)
const GHANA_LAT_MIN = 4.5;
const GHANA_LAT_MAX = 11.2;
const GHANA_LNG_MIN = -3.3;
const GHANA_LNG_MAX = 1.2;

// Reject HTML tags in free text fields to prevent stored XSS
const noHtmlRegex = /<[^>]*>/;

// Allow-list for fields rendered on the public, unauthenticated verify page.
// Permits letters/numbers in any script + a tight set of punctuation; rejects
// HTML, javascript:, RTL override, zero-width chars, and control chars that
// could be used for homograph/phishing payloads. Used for refinery_name.
const safeRefineryNameRegex = /^[\p{L}\p{N} .,'\-&()]+$/u;

// Strips chars that should never appear in a public-facing string:
//   U+0000-U+001F   C0 controls (incl. NUL, tab, newline)
//   U+007F-U+009F   DEL + C1 controls
//   U+200B-U+200F   zero-width / directional marks
//   U+202A-U+202E   bidi overrides (LRE, RLE, PDF, LRO, RLO)
//   U+2066-U+2069   isolate marks (LRI, RLI, FSI, PDI)
//   U+FEFF          BOM
const CONTROL_CHARS_RE =
  /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
function stripControlChars(val: string): string {
  return val.replace(CONTROL_CHARS_RE, "");
}

/**
 * Node 01 — Mine Production Declaration
 * Operator field form: weight, GPS, notes, optional offline timestamp
 */
export const declareSchema = z.object({
  declared_weight_kg: z
    .number({ required_error: "Weight is required", invalid_type_error: "Weight must be a number" })
    .min(0.0001, "Minimum declared weight is 0.0001 kg")
    .max(10000, "Weight cannot exceed 10,000 kg")
    .refine(
      (val) => {
        const decimalPart = val.toString().split(".")[1];
        return !decimalPart || decimalPart.length <= 4;
      },
      { message: "Weight cannot have more than 4 decimal places" }
    ),
  gps_lat: z
    .number()
    .min(GHANA_LAT_MIN, `Latitude must be within Ghana (${GHANA_LAT_MIN}° to ${GHANA_LAT_MAX}°)`)
    .max(GHANA_LAT_MAX, `Latitude must be within Ghana (${GHANA_LAT_MIN}° to ${GHANA_LAT_MAX}°)`)
    .optional()
    .nullable(),
  gps_lng: z
    .number()
    .min(GHANA_LNG_MIN, `Longitude must be within Ghana (${GHANA_LNG_MIN}° to ${GHANA_LNG_MAX}°)`)
    .max(GHANA_LNG_MAX, `Longitude must be within Ghana (${GHANA_LNG_MIN}° to ${GHANA_LNG_MAX}°)`)
    .optional()
    .nullable(),
  field_notes: z
    .string()
    .max(500, "Field notes cannot exceed 500 characters")
    .refine((val) => !noHtmlRegex.test(val), { message: "HTML content is not allowed" })
    .transform((val) => val?.trim() || undefined)
    .optional()
    .nullable(),
  captured_at: z
    .string()
    .datetime({ message: "captured_at must be a valid ISO datetime string" })
    .optional()
    .nullable(),
});

/**
 * Node 02 — GoldBod Export Certification
 * Officer approval: batch reference, assay, export permit
 */
export const approveSchema = z.object({
  batch_id: z.string().uuid("Invalid batch ID format"),
  assay_ref: z
    .string()
    .max(100, "Assay reference cannot exceed 100 characters")
    .refine((val) => !noHtmlRegex.test(val), { message: "HTML content is not allowed" })
    .optional()
    .nullable(),
  export_permit: z
    .string()
    .max(100, "Export permit cannot exceed 100 characters")
    .refine((val) => !noHtmlRegex.test(val), { message: "HTML content is not allowed" })
    .optional()
    .nullable(),
  officer_notes: z
    .string()
    .max(500, "Officer notes cannot exceed 500 characters")
    .refine((val) => !noHtmlRegex.test(val), { message: "HTML content is not allowed" })
    .optional()
    .nullable(),
});

/**
 * Node 03 — Refinery Intake Verification
 * Refinery confirms received weight for reconciliation.
 *
 * refinery_type captures which refinery received the gold:
 *   GCR    — Gold Coast Refinery (Ghana, operational since 2026-02-04;
 *            mandated first stop as Ghana phases out raw exports)
 *   EU     — European refinery (downstream/secondary stop)
 *   OTHER  — Any other refinery (Rand, Dubai contingency, etc.)
 * Identity is stored as data on the Node 03 record so the 4-node topology
 * stays fixed.
 *
 * refinery_name is REQUIRED when refinery_type === "OTHER" and FORBIDDEN
 * otherwise. Enforced via superRefine. The field is rendered on the public,
 * unauthenticated verify page, so it is normalized (control chars stripped,
 * trimmed) and validated against a strict allow-list.
 */
export const REFINERY_TYPES = ["GCR", "EU", "OTHER"] as const;

const refineryNameSchema = z
  .string()
  .transform((val) => stripControlChars(val).trim())
  .pipe(
    z
      .string()
      .max(100, "Refinery name cannot exceed 100 characters")
      .regex(safeRefineryNameRegex, {
        message:
          "Refinery name may only contain letters, numbers, spaces, and . , ' - & ( )",
      })
  );

export const intakeSchema = z
  .object({
    batch_id: z.string().uuid("Invalid batch ID format"),
    intake_weight_kg: z
      .number({ required_error: "Intake weight is required", invalid_type_error: "Intake weight must be a number" })
      .min(0.0001, "Minimum intake weight is 0.0001 kg")
      .max(10000, "Intake weight cannot exceed 10,000 kg")
      .refine(
        (val) => {
          const decimalPart = val.toString().split(".")[1];
          return !decimalPart || decimalPart.length <= 4;
        },
        { message: "Intake weight cannot have more than 4 decimal places" }
      ),
    refinery_type: z.enum(REFINERY_TYPES, {
      required_error: "Refinery type is required",
      invalid_type_error: "Refinery type must be GCR, EU, or OTHER",
    }),
    refinery_name: refineryNameSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasName =
      typeof data.refinery_name === "string" && data.refinery_name.length > 0;

    if (data.refinery_type === "OTHER" && !hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refinery_name"],
        message: "Refinery name is required when refinery_type is OTHER",
      });
    }

    if (data.refinery_type !== "OTHER" && hasName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["refinery_name"],
        message:
          "Refinery name is only allowed when refinery_type is OTHER (got " +
          data.refinery_type +
          ")",
      });
    }
  });

/**
 * Auth — Login form validation
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .email("Invalid email address"),
  password: z
    .string({ required_error: "Password is required" })
    .min(6, "Password must be at least 6 characters"),
});

/**
 * FLAG Review — GoldBod officer resolves a flagged batch
 * Actions: OVERRIDE (approve despite flag), REJECT, ESCALATE
 */
export const flagReviewSchema = z.object({
  batch_id: z.string().uuid("Invalid batch ID format"),
  action: z.enum(["OVERRIDE", "REJECT", "ESCALATE"], {
    required_error: "Review action is required",
  }),
  officer_notes: z
    .string({ required_error: "Notes are required for flag reviews" })
    .min(10, "Please provide at least 10 characters explaining the decision")
    .max(1000, "Notes cannot exceed 1000 characters")
    .refine((val) => !noHtmlRegex.test(val), { message: "HTML content is not allowed" }),
});

// Export inferred types for use in server actions
export type DeclareInput = z.infer<typeof declareSchema>;
export type ApproveInput = z.infer<typeof approveSchema>;
export type IntakeInput = z.infer<typeof intakeSchema>;
export type FlagReviewInput = z.infer<typeof flagReviewSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
