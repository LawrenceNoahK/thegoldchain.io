"use server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/rate-limit";

export type UploadResult =
  | { success: true; path: string; url: string }
  | { success: false; error: string };

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const ALLOWED_ASSAY_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_ASSAY_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Server Action: Upload assay PDF for a batch (Node 02 attachment)
 * Only goldbod_officer or admin can upload assay documents.
 */
export async function uploadAssayAction(formData: FormData): Promise<UploadResult> {
  try {
    const file = formData.get("file") as File | null;
    const batchId = formData.get("batch_id") as string | null;

    if (!file || !batchId) {
      return { success: false, error: "File and batch_id are required" };
    }

    // Validate file type
    if (!ALLOWED_ASSAY_TYPES.includes(file.type)) {
      return { success: false, error: "Only PDF, JPEG, and PNG files are allowed for assay documents" };
    }

    // Validate file size
    if (file.size > MAX_ASSAY_SIZE) {
      return { success: false, error: "File size must not exceed 10 MB" };
    }

    // Auth
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["goldbod_officer", "admin"].includes(profile.role)) {
      return { success: false, error: "Only GoldBod officers can upload assay documents" };
    }

    // Rate limit
    const rateLimitResult = await rateLimit(`upload:${user.id}`, 30, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return { success: false, error: "Rate limit exceeded" };
    }

    // Verify batch exists
    const { data: batch } = await supabase
      .from("gold_batches")
      .select("id, batch_id")
      .eq("id", batchId)
      .single();

    if (!batch) {
      return { success: false, error: "Batch not found" };
    }

    // Derive extension from validated MIME type (not user filename)
    const ext = MIME_TO_EXT[file.type] || "pdf";
    const safeName = `assay_${Date.now()}.${ext}`;
    const storagePath = `${batch.batch_id}/${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("assay-docs")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // Get signed URL (valid for 1 hour)
    const { data: urlData } = await supabase.storage
      .from("assay-docs")
      .createSignedUrl(storagePath, 3600);

    return {
      success: true,
      path: storagePath,
      url: urlData?.signedUrl || "",
    };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}

/**
 * Server Action: Upload site photo for a batch (Node 01 attachment)
 * Only operators or admin can upload site photos.
 */
export async function uploadSitePhotoAction(formData: FormData): Promise<UploadResult> {
  try {
    const file = formData.get("file") as File | null;
    const batchId = formData.get("batch_id") as string | null;

    if (!file || !batchId) {
      return { success: false, error: "File and batch_id are required" };
    }

    // Validate file type
    if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
      return { success: false, error: "Only JPEG, PNG, and WebP images are allowed" };
    }

    // Validate file size
    if (file.size > MAX_PHOTO_SIZE) {
      return { success: false, error: "Photo size must not exceed 5 MB" };
    }

    // Auth
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { success: false, error: "Not authenticated" };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["operator", "admin"].includes(profile.role)) {
      return { success: false, error: "Only operators can upload site photos" };
    }

    // Rate limit
    const rateLimitResult = await rateLimit(`upload:${user.id}`, 30, 60 * 60 * 1000);
    if (!rateLimitResult.success) {
      return { success: false, error: "Rate limit exceeded" };
    }

    // Verify batch exists and belongs to operator
    const { data: batch } = await supabase
      .from("gold_batches")
      .select("id, batch_id")
      .eq("id", batchId)
      .single();

    if (!batch) {
      return { success: false, error: "Batch not found" };
    }

    // Derive extension from validated MIME type (not user filename)
    const ext = MIME_TO_EXT[file.type] || "jpg";
    const safeName = `photo_${Date.now()}.${ext}`;
    const storagePath = `${batch.batch_id}/${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("site-photos")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // Get signed URL
    const { data: urlData } = await supabase.storage
      .from("site-photos")
      .createSignedUrl(storagePath, 3600);

    return {
      success: true,
      path: storagePath,
      url: urlData?.signedUrl || "",
    };
  } catch {
    return { success: false, error: "An unexpected error occurred" };
  }
}
