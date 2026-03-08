-- ============================================================
-- THE GOLDCHAIN — Module 1: Audit Log (SACRED — append only)
-- Never add UPDATE or DELETE permissions
-- Daily SHA-256 hash written to Hyperledger
-- ============================================================

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  record_id UUID NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  old_data JSONB,
  new_data JSONB
);

-- Append-only: revoke all modification rights
-- Only the trigger function (SECURITY DEFINER) can insert
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON audit_log FROM authenticated;
REVOKE UPDATE, DELETE ON audit_log FROM anon;

CREATE INDEX idx_audit_table ON audit_log(table_name);
CREATE INDEX idx_audit_record ON audit_log(record_id);
CREATE INDEX idx_audit_changed_at ON audit_log(changed_at DESC);
CREATE INDEX idx_audit_changed_by ON audit_log(changed_by);

-- ============================================================
-- GENERIC AUDIT TRIGGER FUNCTION
-- Captures all changes to tracked tables
-- ============================================================

CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, operation, record_id, changed_by, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, auth.uid(), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, operation, record_id, changed_by, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, operation, record_id, changed_by, old_data)
    VALUES (TG_TABLE_NAME, TG_OP, OLD.id, auth.uid(), to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ATTACH AUDIT TRIGGERS TO ALL TRACKED TABLES
-- ============================================================

CREATE TRIGGER audit_operators
  AFTER INSERT OR UPDATE OR DELETE ON operators
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_gold_batches
  AFTER INSERT OR UPDATE OR DELETE ON gold_batches
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_batch_nodes
  AFTER INSERT OR UPDATE OR DELETE ON batch_nodes
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_satellite_checks
  AFTER INSERT OR UPDATE OR DELETE ON satellite_checks
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_csddd_certificates
  AFTER INSERT OR UPDATE OR DELETE ON csddd_certificates
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================
-- DAILY HASH FUNCTION
-- Computes SHA-256 of all audit entries for a given day
-- This hash gets written to Hyperledger Fabric daily
-- ============================================================

CREATE OR REPLACE FUNCTION compute_daily_audit_hash(target_date DATE)
RETURNS TEXT AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT encode(
    digest(
      string_agg(
        id::TEXT || table_name || operation || record_id::TEXT || changed_at::TEXT || COALESCE(old_data::TEXT, '') || COALESCE(new_data::TEXT, ''),
        '|' ORDER BY changed_at, id
      ),
      'sha256'
    ),
    'hex'
  ) INTO v_hash
  FROM audit_log
  WHERE changed_at >= target_date
    AND changed_at < target_date + INTERVAL '1 day';

  RETURN COALESCE(v_hash, 'NO_ENTRIES');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
