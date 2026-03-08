import { z } from "zod";

// ============================================================
// THE GOLDCHAIN — Zod Validation Schemas
// All mutation inputs must be validated through these schemas
// ============================================================

/**
 * Node 01 — Mine Production Declaration
 * Operator field form: weight, GPS, notes, optional offline timestamp
 */
export const declareSchema = z.object({
  declared_weight_kg: z
    .number({ required_error: "Weight is required", invalid_type_error: "Weight must be a number" })
    .positive("Weight must be greater than 0")
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
    .min(-90, "Latitude must be between -90 and 90")
    .max(90, "Latitude must be between -90 and 90")
    .optional()
    .nullable(),
  gps_lng: z
    .number()
    .min(-180, "Longitude must be between -180 and 180")
    .max(180, "Longitude must be between -180 and 180")
    .optional()
    .nullable(),
  field_notes: z
    .string()
    .max(500, "Field notes cannot exceed 500 characters")
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
    .optional()
    .nullable(),
  export_permit: z
    .string()
    .max(100, "Export permit cannot exceed 100 characters")
    .optional()
    .nullable(),
  officer_notes: z
    .string()
    .max(500, "Officer notes cannot exceed 500 characters")
    .optional()
    .nullable(),
});

/**
 * Node 03 — Refinery Intake Verification
 * Refinery confirms received weight for reconciliation
 */
export const intakeSchema = z.object({
  batch_id: z.string().uuid("Invalid batch ID format"),
  intake_weight_kg: z
    .number({ required_error: "Intake weight is required", invalid_type_error: "Intake weight must be a number" })
    .positive("Intake weight must be greater than 0")
    .max(10000, "Intake weight cannot exceed 10,000 kg")
    .refine(
      (val) => {
        const decimalPart = val.toString().split(".")[1];
        return !decimalPart || decimalPart.length <= 4;
      },
      { message: "Intake weight cannot have more than 4 decimal places" }
    ),
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

// Export inferred types for use in server actions
export type DeclareInput = z.infer<typeof declareSchema>;
export type ApproveInput = z.infer<typeof approveSchema>;
export type IntakeInput = z.infer<typeof intakeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
