-- ============================================================
-- THE GOLDCHAIN — Security Hardening Migration
-- Fixes: rate limiting, idempotency, batch status consistency,
--        satellite check enforcement, missing indexes
-- ============================================================

-- ============================================================
-- 1. PERSISTENT RATE LIMITING TABLE
-- Replaces in-memory rate limiter that resets on deploy
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_key_time ON rate_limit_checks(key, created_at DESC);

-- Auto-cleanup: delete entries older than 2 hours
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_checks WHERE created_at < NOW() - INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- No RLS on rate_limit_checks — only accessed via admin client
ALTER TABLE rate_limit_checks ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. IDEMPOTENCY KEY FOR GOLD BATCHES
-- Prevents double-submission of offline declarations
-- ============================================================

ALTER TABLE gold_batches
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_batches_idempotency ON gold_batches(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 3. TIGHTEN SATELLITE CHECK ENFORCEMENT IN NODE ORDER TRIGGER
-- Require overall_status = 'PASS' (not just != 'PENDING')
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

  -- Node 2 requires satellite check to PASS (not just complete)
  IF NEW.node_number = 2 THEN
    IF NOT EXISTS (
      SELECT 1 FROM satellite_checks
      WHERE batch_id = NEW.batch_id
        AND overall_status = 'PASS'
    ) THEN
      RAISE EXCEPTION 'Node 2 cannot be created: satellite check must PASS first';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. FIX BATCH STATUS RACE CONDITION
-- Weight reconciliation trigger sets FLAGGED, then update_batch_status
-- could overwrite it. Fix: update_batch_status now checks FLAGGED FIRST
-- and weight reconciliation runs BEFORE (priority) the status update.
-- ============================================================

CREATE OR REPLACE FUNCTION update_batch_status()
RETURNS TRIGGER AS $$
DECLARE
  v_current_status batch_status;
BEGIN
  -- Get current batch status
  SELECT status INTO v_current_status FROM gold_batches WHERE id = NEW.batch_id;

  -- NEVER overwrite FLAGGED status — only admin can un-flag
  IF v_current_status = 'FLAGGED' THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CONFIRMED' THEN
    CASE NEW.node_number
      WHEN 2 THEN
        UPDATE gold_batches SET status = 'NODE_02_APPROVED' WHERE id = NEW.batch_id AND status = 'PENDING';
      WHEN 3 THEN
        UPDATE gold_batches SET status = 'NODE_03_CONFIRMED' WHERE id = NEW.batch_id AND status = 'NODE_02_APPROVED';
      WHEN 4 THEN
        UPDATE gold_batches SET status = 'CERTIFIED' WHERE id = NEW.batch_id AND status = 'NODE_03_CONFIRMED';
      ELSE NULL;
    END CASE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. MISSING COMPOSITE INDEXES FOR HOT QUERIES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_batch_nodes_batch_status ON batch_nodes(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_batch_nodes_batch_node ON batch_nodes(batch_id, node_number);
CREATE INDEX IF NOT EXISTS idx_batches_status_operator ON gold_batches(status, operator_id);
CREATE INDEX IF NOT EXISTS idx_batches_operator_created ON gold_batches(operator_id, created_at DESC);

-- ============================================================
-- 6. HMAC SERVER SECRET TABLE
-- Stores a server-side HMAC secret for offline declaration signing
-- The secret is combined with the user's token to create a key
-- that cannot be reconstructed from IndexedDB alone
-- ============================================================

CREATE TABLE IF NOT EXISTS hmac_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  UNIQUE(user_id)
);

ALTER TABLE hmac_secrets ENABLE ROW LEVEL SECURITY;

-- Only the user can read their own secret (for signing on client)
CREATE POLICY hmac_select_own ON hmac_secrets
  FOR SELECT USING (user_id = auth.uid());

-- No user INSERT/UPDATE/DELETE — managed by API routes via admin client
