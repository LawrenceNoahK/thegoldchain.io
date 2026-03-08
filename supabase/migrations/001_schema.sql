-- ============================================================
-- THE GOLDCHAIN — Module 1: Core Schema
-- Ghana Gold Board Act 2025 (Act 1140)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE operator_status AS ENUM ('active', 'suspended');

CREATE TYPE batch_status AS ENUM (
  'PENDING',
  'NODE_02_APPROVED',
  'NODE_03_CONFIRMED',
  'CERTIFIED',
  'FLAGGED'
);

CREATE TYPE node_status AS ENUM ('CONFIRMED', 'PENDING', 'FLAGGED');

CREATE TYPE satellite_status AS ENUM ('PASS', 'FAIL', 'PENDING', 'ERROR');

CREATE TYPE user_role AS ENUM ('operator', 'goldbod_officer', 'refinery', 'auditor', 'admin');

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'operator',
  operator_id UUID,  -- FK added after operators table
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- OPERATORS (licensed ASM operators)
-- ============================================================

CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  license_number TEXT NOT NULL UNIQUE,  -- MCAS license
  region TEXT NOT NULL,
  status operator_status NOT NULL DEFAULT 'active',
  gps_lat DOUBLE PRECISION,
  gps_lng DOUBLE PRECISION,
  concession_geojson JSONB,  -- GeoJSON polygon of licensed area
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from profiles to operators
ALTER TABLE profiles
  ADD CONSTRAINT fk_profiles_operator
  FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE SET NULL;

CREATE INDEX idx_operators_license ON operators(license_number);
CREATE INDEX idx_operators_status ON operators(status);
CREATE INDEX idx_operators_region ON operators(region);

-- ============================================================
-- GOLD BATCHES
-- ============================================================

-- Sequence for batch IDs: GHB-YYYY-NNNN
CREATE SEQUENCE gold_batch_seq START 1;

CREATE TABLE gold_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE,  -- Auto-set by trigger: GHB-YYYY-NNNN
  operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
  declared_weight_kg NUMERIC(10, 4) NOT NULL CHECK (declared_weight_kg > 0),
  status batch_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-generate batch_id on insert
CREATE OR REPLACE FUNCTION generate_batch_id()
RETURNS TRIGGER AS $$
BEGIN
  NEW.batch_id := 'GHB-' || EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()))::INTEGER::TEXT
    || '-' || LPAD(nextval('gold_batch_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_batch_id
  BEFORE INSERT ON gold_batches
  FOR EACH ROW
  WHEN (NEW.batch_id IS NULL)
  EXECUTE FUNCTION generate_batch_id();

CREATE INDEX idx_batches_operator ON gold_batches(operator_id);
CREATE INDEX idx_batches_status ON gold_batches(status);
CREATE INDEX idx_batches_batch_id ON gold_batches(batch_id);
CREATE INDEX idx_batches_created ON gold_batches(created_at DESC);

-- ============================================================
-- BATCH NODES (4-node chain of custody)
-- ============================================================

CREATE TABLE batch_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES gold_batches(id) ON DELETE RESTRICT,
  node_number INTEGER NOT NULL CHECK (node_number BETWEEN 1 AND 4),
  officer_id UUID REFERENCES profiles(id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data JSONB NOT NULL DEFAULT '{}',
  tx_hash TEXT,  -- Hyperledger Fabric transaction hash
  status node_status NOT NULL DEFAULT 'PENDING',

  -- Enforce one entry per node per batch
  UNIQUE (batch_id, node_number)
);

CREATE INDEX idx_nodes_batch ON batch_nodes(batch_id);
CREATE INDEX idx_nodes_status ON batch_nodes(status);

-- ============================================================
-- CONSTRAINT: Enforce strict node ordering
-- Node N cannot be inserted unless Node N-1 is CONFIRMED
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_node_order()
RETURNS TRIGGER AS $$
BEGIN
  -- Node 1 can always be inserted
  IF NEW.node_number = 1 THEN
    RETURN NEW;
  END IF;

  -- Check that the previous node exists and is CONFIRMED
  IF NOT EXISTS (
    SELECT 1 FROM batch_nodes
    WHERE batch_id = NEW.batch_id
      AND node_number = NEW.node_number - 1
      AND status = 'CONFIRMED'
  ) THEN
    RAISE EXCEPTION 'Node % cannot be created: Node % must be CONFIRMED first',
      NEW.node_number, NEW.node_number - 1;
  END IF;

  -- Node 2 requires satellite check to be complete and not flagged
  IF NEW.node_number = 2 THEN
    IF NOT EXISTS (
      SELECT 1 FROM satellite_checks
      WHERE batch_id = NEW.batch_id
        AND overall_status != 'PENDING'
    ) THEN
      RAISE EXCEPTION 'Node 2 cannot be created: satellite check has not completed';
    END IF;

    IF EXISTS (
      SELECT 1 FROM satellite_checks
      WHERE batch_id = NEW.batch_id
        AND overall_status = 'FAIL'
    ) THEN
      RAISE EXCEPTION 'Node 2 cannot be created: satellite check FAILED';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_node_order
  BEFORE INSERT ON batch_nodes
  FOR EACH ROW EXECUTE FUNCTION enforce_node_order();

-- ============================================================
-- CONSTRAINT: TX hash must exist before CONFIRMED
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_tx_hash_on_confirm()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' AND (NEW.tx_hash IS NULL OR NEW.tx_hash = '') THEN
    RAISE EXCEPTION 'Cannot set node to CONFIRMED without a valid tx_hash';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_tx_hash
  BEFORE INSERT OR UPDATE ON batch_nodes
  FOR EACH ROW EXECUTE FUNCTION enforce_tx_hash_on_confirm();

-- ============================================================
-- SATELLITE CHECKS
-- ============================================================

CREATE TABLE satellite_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES gold_batches(id) ON DELETE RESTRICT,
  check_1_surface_disturbance satellite_status NOT NULL DEFAULT 'PENDING',
  check_2_boundary_compliance satellite_status NOT NULL DEFAULT 'PENDING',
  check_3_deforestation satellite_status NOT NULL DEFAULT 'PENDING',
  check_4_water_proximity satellite_status NOT NULL DEFAULT 'PENDING',
  check_5_volume_plausibility satellite_status NOT NULL DEFAULT 'PENDING',
  check_6_anomaly_detection satellite_status NOT NULL DEFAULT 'PENDING',
  overall_status satellite_status NOT NULL DEFAULT 'PENDING',
  flagged_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (batch_id)
);

CREATE INDEX idx_sat_batch ON satellite_checks(batch_id);
CREATE INDEX idx_sat_status ON satellite_checks(overall_status);

-- ============================================================
-- CSDDD CERTIFICATES
-- ============================================================

CREATE TABLE csddd_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES gold_batches(id) ON DELETE RESTRICT,
  certificate_url TEXT,
  audit_trail_hash TEXT NOT NULL,  -- SHA-256 of all node data
  qr_code_url TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  node_1_tx TEXT NOT NULL,
  node_2_tx TEXT NOT NULL,
  node_3_tx TEXT NOT NULL,

  UNIQUE (batch_id)
);

CREATE INDEX idx_certs_batch ON csddd_certificates(batch_id);

-- ============================================================
-- WEIGHT RECONCILIATION TRIGGER
-- Auto-flag batch if Node 03 weight differs from Node 01 by >0.1%
-- ============================================================

CREATE OR REPLACE FUNCTION check_weight_reconciliation()
RETURNS TRIGGER AS $$
DECLARE
  v_declared_weight NUMERIC;
  v_intake_weight NUMERIC;
  v_discrepancy NUMERIC;
BEGIN
  -- Only check when Node 3 is being confirmed
  IF NEW.node_number != 3 OR NEW.status != 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  -- Get declared weight from gold_batches
  SELECT declared_weight_kg INTO v_declared_weight
  FROM gold_batches WHERE id = NEW.batch_id;

  -- Get intake weight from Node 3 data
  v_intake_weight := (NEW.data->>'intake_weight_kg')::NUMERIC;

  IF v_intake_weight IS NULL THEN
    RAISE EXCEPTION 'Node 3 data must include intake_weight_kg';
  END IF;

  -- Calculate discrepancy
  v_discrepancy := ABS(v_intake_weight - v_declared_weight) / v_declared_weight;

  -- Flag if >0.1%
  IF v_discrepancy > 0.001 THEN
    UPDATE gold_batches SET status = 'FLAGGED' WHERE id = NEW.batch_id;
    NEW.status := 'FLAGGED';
    NEW.data := NEW.data || jsonb_build_object(
      'weight_discrepancy_pct', ROUND(v_discrepancy * 100, 4),
      'declared_weight_kg', v_declared_weight,
      'intake_weight_kg', v_intake_weight,
      'auto_flagged', true
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_weight_reconciliation
  BEFORE INSERT OR UPDATE ON batch_nodes
  FOR EACH ROW EXECUTE FUNCTION check_weight_reconciliation();

-- ============================================================
-- BATCH STATUS AUTO-UPDATE
-- Updates gold_batches.status as nodes are confirmed
-- ============================================================

CREATE OR REPLACE FUNCTION update_batch_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'CONFIRMED' THEN
    CASE NEW.node_number
      WHEN 2 THEN
        UPDATE gold_batches SET status = 'NODE_02_APPROVED' WHERE id = NEW.batch_id;
      WHEN 3 THEN
        -- Only update if not already FLAGGED by weight check
        UPDATE gold_batches SET status = 'NODE_03_CONFIRMED'
        WHERE id = NEW.batch_id AND status != 'FLAGGED';
      WHEN 4 THEN
        UPDATE gold_batches SET status = 'CERTIFIED'
        WHERE id = NEW.batch_id AND status != 'FLAGGED';
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_batch_status
  AFTER INSERT OR UPDATE ON batch_nodes
  FOR EACH ROW EXECUTE FUNCTION update_batch_status();
