-- ============================================================
-- Add REJECTED to batch_status enum
-- Required for FLAG review REJECT action
-- ============================================================

ALTER TYPE batch_status ADD VALUE 'REJECTED';
