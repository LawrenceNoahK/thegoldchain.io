-- ============================================================
-- THE GOLDCHAIN — Storage Buckets for File Uploads
-- Supabase Storage for assay PDFs and site photos
-- ============================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('assay-docs', 'assay-docs', false, 10485760, -- 10 MB
    ARRAY['application/pdf', 'image/jpeg', 'image/png']),
  ('site-photos', 'site-photos', false, 5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- ============================================================
-- RLS Policies for assay-docs bucket
-- ============================================================

-- GoldBod officers can upload assay documents
CREATE POLICY "goldbod_upload_assay"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'assay-docs'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('goldbod_officer', 'admin')
      )
    )
  );

-- GoldBod officers, refineries, auditors, and admins can read assay docs
CREATE POLICY "authorized_read_assay"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'assay-docs'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('goldbod_officer', 'refinery', 'auditor', 'admin')
      )
    )
  );

-- ============================================================
-- RLS Policies for site-photos bucket
-- ============================================================

-- Operators can upload their own site photos
CREATE POLICY "operator_upload_photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'site-photos'
    AND (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND role IN ('operator', 'admin')
      )
    )
  );

-- All authenticated users can view site photos
CREATE POLICY "authenticated_read_photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'site-photos'
    AND auth.uid() IS NOT NULL
  );

-- ============================================================
-- Add file reference columns to batch_nodes data
-- (Files stored in Supabase Storage, paths stored in JSONB data)
-- No schema change needed: batch_nodes.data is already JSONB
-- File paths stored as:
--   data.assay_pdf_path = "assay-docs/{batch_id}/{filename}"
--   data.site_photo_paths = ["site-photos/{batch_id}/{filename}", ...]
-- ============================================================
