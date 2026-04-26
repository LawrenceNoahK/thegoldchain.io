-- ============================================================
-- THE GOLDCHAIN — Public verify page RLS + refinery_type index
--
-- The /verify/[batchId] page is documented as public (no auth).
-- Existing RLS policies all require auth.uid() IS NOT NULL, which
-- silently blocks anon reads. This migration adds anon SELECT
-- policies scoped narrowly to data needed for a CSDDD verification.
--
-- Anon users can read:
--   - csddd_certificates: any row (these are the public artifacts)
--   - gold_batches: only batches that have a certificate
--   - operators: only operators tied to a certified batch
--   - batch_nodes: only Node 3 of certified batches (refinery_type
--     is the new public-facing field; Nodes 1/2/4 are not needed
--     for the verify page render)
-- ============================================================

-- CSDDD certificates: anon can read all (public verification artifacts)
CREATE POLICY certs_select_anon ON csddd_certificates
  FOR SELECT USING (auth.uid() IS NULL);

-- Gold batches: anon can read only batches with a certificate
CREATE POLICY batches_select_anon_certified ON gold_batches
  FOR SELECT USING (
    auth.uid() IS NULL
    AND EXISTS (
      SELECT 1 FROM csddd_certificates
      WHERE csddd_certificates.batch_id = gold_batches.id
    )
  );

-- Operators: anon can read only operators tied to a certified batch
CREATE POLICY operators_select_anon_certified ON operators
  FOR SELECT USING (
    auth.uid() IS NULL
    AND EXISTS (
      SELECT 1
      FROM gold_batches gb
      JOIN csddd_certificates cc ON cc.batch_id = gb.id
      WHERE gb.operator_id = operators.id
    )
  );

-- Batch nodes: anon can read only Node 3 of certified batches
-- (Node 3 carries the new refinery_type field shown on verify page;
-- other node data is not needed publicly.)
CREATE POLICY nodes_select_anon_certified_node3 ON batch_nodes
  FOR SELECT USING (
    auth.uid() IS NULL
    AND node_number = 3
    AND batch_id IN (
      SELECT gb.id
      FROM gold_batches gb
      JOIN csddd_certificates cc ON cc.batch_id = gb.id
    )
  );

-- ============================================================
-- Index: fast lookup of refinery_type from Node 3 JSONB data
-- Partial index keeps it small (only Node 3 carries this field).
-- Supports analytics queries like "% of batches GCR-first".
-- ============================================================

CREATE INDEX IF NOT EXISTS batch_nodes_refinery_type_idx
  ON batch_nodes ((data->>'refinery_type'))
  WHERE node_number = 3;
