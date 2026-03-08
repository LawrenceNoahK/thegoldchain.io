-- ============================================================
-- THE GOLDCHAIN — Module 2: Offline Support & Fabric Prep
-- Sprint 1 Security Foundation
-- ============================================================

-- Add captured_at column for offline submissions
-- When an operator submits a declaration offline, the client records
-- the local timestamp. This is stored separately from the DB timestamp.
ALTER TABLE batch_nodes
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;

-- ============================================================
-- MODIFY enforce_tx_hash_on_confirm to accept 'PENDING_FABRIC'
--
-- TEMPORARY: Until Module 8 (Hyperledger Fabric integration),
-- server actions write 'PENDING_FABRIC' as a placeholder tx_hash.
-- Once Fabric is integrated, this function should be updated to
-- reject 'PENDING_FABRIC' and require a real Fabric TX hash.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_tx_hash_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND (NEW.tx_hash IS NULL OR NEW.tx_hash = '') THEN
    RAISE EXCEPTION 'Cannot set node to CONFIRMED without a valid tx_hash';
  END IF;
  -- TEMPORARY: Accept 'PENDING_FABRIC' as a valid tx_hash until Module 8
  -- Hyperledger Fabric integration replaces this with real TX hashes.
  -- TODO(Module 8): Remove this exception and require real Fabric TX hashes.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- GIN index on operators.concession_geojson for PostGIS spatial queries
-- Supports satellite boundary compliance checks (Module 5)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_operators_concession_geojson
  ON operators USING GIN (concession_geojson);
