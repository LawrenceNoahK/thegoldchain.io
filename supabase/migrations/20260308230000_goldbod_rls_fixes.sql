-- ============================================================
-- THE GOLDCHAIN — RLS Policy Fixes for GoldBod Officer Actions
--
-- Server actions (satellite verify, approve, certify, flag review)
-- run with the user's session, so goldbod_officer needs INSERT/UPDATE
-- on satellite_checks, csddd_certificates, and gold_batches.
-- ============================================================

-- GoldBod officer can update batch status (approve, flag, certify)
CREATE POLICY batches_update_goldbod ON gold_batches
  FOR UPDATE USING (get_user_role() = 'goldbod_officer');

-- GoldBod officer can insert satellite checks
CREATE POLICY sat_insert_goldbod ON satellite_checks
  FOR INSERT WITH CHECK (get_user_role() = 'goldbod_officer');

-- Admin can insert satellite checks
CREATE POLICY sat_insert_admin ON satellite_checks
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

-- GoldBod officer can insert CSDDD certificates
CREATE POLICY certs_insert_goldbod ON csddd_certificates
  FOR INSERT WITH CHECK (get_user_role() = 'goldbod_officer');

-- Admin can insert CSDDD certificates
CREATE POLICY certs_insert_admin ON csddd_certificates
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

-- GoldBod officer can insert Node 4 (certificate node)
-- Existing policy only allows node_number = 2; need node 4 for certify
CREATE POLICY nodes_insert_goldbod_node4 ON batch_nodes
  FOR INSERT WITH CHECK (
    get_user_role() = 'goldbod_officer'
    AND node_number = 4
  );
