-- ============================================================
-- THE GOLDCHAIN — Module 1: Row Level Security Policies
-- RLS is the real security layer — never bypass in user-facing code
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE gold_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE satellite_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE csddd_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: Get current user's role
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- HELPER: Get current user's operator_id
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_operator_id()
RETURNS UUID AS $$
  SELECT operator_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES
-- ============================================================

-- Everyone can read their own profile
CREATE POLICY profiles_select_own ON profiles
  FOR SELECT USING (id = auth.uid());

-- Admin can read all profiles
CREATE POLICY profiles_select_admin ON profiles
  FOR SELECT USING (get_user_role() = 'admin');

-- GoldBod officers can read all profiles
CREATE POLICY profiles_select_goldbod ON profiles
  FOR SELECT USING (get_user_role() = 'goldbod_officer');

-- ============================================================
-- OPERATORS
-- ============================================================

-- Operator sees own record only
CREATE POLICY operators_select_own ON operators
  FOR SELECT USING (id = get_user_operator_id());

-- GoldBod, auditor, admin see all operators
CREATE POLICY operators_select_goldbod ON operators
  FOR SELECT USING (get_user_role() IN ('goldbod_officer', 'auditor', 'admin'));

-- Admin can write operators
CREATE POLICY operators_insert_admin ON operators
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

CREATE POLICY operators_update_admin ON operators
  FOR UPDATE USING (get_user_role() = 'admin');

-- ============================================================
-- GOLD BATCHES
-- ============================================================

-- Operator sees own batches only
CREATE POLICY batches_select_operator ON gold_batches
  FOR SELECT USING (
    get_user_role() = 'operator'
    AND operator_id = get_user_operator_id()
  );

-- GoldBod officer sees all batches
CREATE POLICY batches_select_goldbod ON gold_batches
  FOR SELECT USING (get_user_role() = 'goldbod_officer');

-- Refinery sees assigned batches (batches at Node 02 APPROVED or later)
CREATE POLICY batches_select_refinery ON gold_batches
  FOR SELECT USING (
    get_user_role() = 'refinery'
    AND status IN ('NODE_02_APPROVED', 'NODE_03_CONFIRMED', 'CERTIFIED')
  );

-- Auditor sees all
CREATE POLICY batches_select_auditor ON gold_batches
  FOR SELECT USING (get_user_role() = 'auditor');

-- Admin sees all
CREATE POLICY batches_select_admin ON gold_batches
  FOR SELECT USING (get_user_role() = 'admin');

-- Operator can create batches (own operator_id only)
CREATE POLICY batches_insert_operator ON gold_batches
  FOR INSERT WITH CHECK (
    get_user_role() = 'operator'
    AND operator_id = get_user_operator_id()
  );

-- Admin can create batches
CREATE POLICY batches_insert_admin ON gold_batches
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

-- Admin can update batches
CREATE POLICY batches_update_admin ON gold_batches
  FOR UPDATE USING (get_user_role() = 'admin');

-- ============================================================
-- BATCH NODES
-- ============================================================

-- Operator can read own batch nodes
CREATE POLICY nodes_select_operator ON batch_nodes
  FOR SELECT USING (
    get_user_role() = 'operator'
    AND batch_id IN (
      SELECT id FROM gold_batches WHERE operator_id = get_user_operator_id()
    )
  );

-- GoldBod, auditor, admin can read all nodes
CREATE POLICY nodes_select_goldbod ON batch_nodes
  FOR SELECT USING (get_user_role() IN ('goldbod_officer', 'auditor', 'admin'));

-- Refinery can read nodes for assigned batches
CREATE POLICY nodes_select_refinery ON batch_nodes
  FOR SELECT USING (
    get_user_role() = 'refinery'
    AND batch_id IN (
      SELECT id FROM gold_batches
      WHERE status IN ('NODE_02_APPROVED', 'NODE_03_CONFIRMED', 'CERTIFIED')
    )
  );

-- Operator can write Node 1 only
CREATE POLICY nodes_insert_operator ON batch_nodes
  FOR INSERT WITH CHECK (
    get_user_role() = 'operator'
    AND node_number = 1
    AND batch_id IN (
      SELECT id FROM gold_batches WHERE operator_id = get_user_operator_id()
    )
  );

-- GoldBod officer can write Node 2 only
CREATE POLICY nodes_insert_goldbod ON batch_nodes
  FOR INSERT WITH CHECK (
    get_user_role() = 'goldbod_officer'
    AND node_number = 2
  );

-- Refinery can write Node 3 only
CREATE POLICY nodes_insert_refinery ON batch_nodes
  FOR INSERT WITH CHECK (
    get_user_role() = 'refinery'
    AND node_number = 3
  );

-- Admin can write any node
CREATE POLICY nodes_insert_admin ON batch_nodes
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

-- GoldBod can update Node 2 (approve/flag)
CREATE POLICY nodes_update_goldbod ON batch_nodes
  FOR UPDATE USING (
    get_user_role() = 'goldbod_officer'
    AND node_number = 2
  );

-- Refinery can update Node 3
CREATE POLICY nodes_update_refinery ON batch_nodes
  FOR UPDATE USING (
    get_user_role() = 'refinery'
    AND node_number = 3
  );

-- Admin can update any node
CREATE POLICY nodes_update_admin ON batch_nodes
  FOR UPDATE USING (get_user_role() = 'admin');

-- ============================================================
-- SATELLITE CHECKS
-- ============================================================

-- GoldBod, auditor, admin can read satellite checks
CREATE POLICY sat_select_goldbod ON satellite_checks
  FOR SELECT USING (get_user_role() IN ('goldbod_officer', 'auditor', 'admin'));

-- Operator can read satellite checks for own batches
CREATE POLICY sat_select_operator ON satellite_checks
  FOR SELECT USING (
    get_user_role() = 'operator'
    AND batch_id IN (
      SELECT id FROM gold_batches WHERE operator_id = get_user_operator_id()
    )
  );

-- No user-facing INSERT/UPDATE — satellite checks are written by Edge Functions (service role)

-- ============================================================
-- CSDDD CERTIFICATES
-- ============================================================

-- Anyone authenticated can read certificates (they're also publicly verifiable)
CREATE POLICY certs_select_authenticated ON csddd_certificates
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- No user-facing INSERT/UPDATE — certificates are generated by Edge Functions (service role)

-- ============================================================
-- AUDIT LOG
-- ============================================================

-- Auditor and admin can read audit log
CREATE POLICY audit_select_auditor ON audit_log
  FOR SELECT USING (get_user_role() IN ('auditor', 'admin'));

-- GoldBod officer can read audit log
CREATE POLICY audit_select_goldbod ON audit_log
  FOR SELECT USING (get_user_role() = 'goldbod_officer');

-- NO INSERT/UPDATE/DELETE policies for users — audit_log is written by triggers only
-- The trigger function runs as SECURITY DEFINER (superuser context)
