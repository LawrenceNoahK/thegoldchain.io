-- ============================================================
-- THE GOLDCHAIN — Fix trigger functions to run as SECURITY DEFINER
--
-- Trigger functions that update gold_batches.status need to bypass RLS
-- since they're system-level state transitions, not user-initiated writes.
-- Without SECURITY DEFINER, a refinery user inserting Node 03 would
-- fail to update gold_batches.status due to missing UPDATE RLS policy.
-- ============================================================

-- update_batch_status: runs AFTER INSERT/UPDATE on batch_nodes
-- Needs to UPDATE gold_batches.status regardless of calling user's role
CREATE OR REPLACE FUNCTION update_batch_status()
RETURNS TRIGGER AS $$
DECLARE
  v_current_status batch_status;
BEGIN
  SELECT status INTO v_current_status FROM gold_batches WHERE id = NEW.batch_id;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- check_weight_reconciliation: runs BEFORE INSERT/UPDATE on batch_nodes
-- Needs to UPDATE gold_batches.status to FLAGGED if weight discrepancy
CREATE OR REPLACE FUNCTION check_weight_reconciliation()
RETURNS TRIGGER AS $$
DECLARE
  v_declared_weight NUMERIC;
  v_intake_weight NUMERIC;
  v_discrepancy NUMERIC;
BEGIN
  IF NEW.node_number = 3 AND NEW.status = 'CONFIRMED' THEN
    SELECT declared_weight_kg INTO v_declared_weight
    FROM gold_batches WHERE id = NEW.batch_id;

    v_intake_weight := (NEW.data->>'intake_weight_kg')::NUMERIC;

    IF v_intake_weight IS NOT NULL AND v_declared_weight IS NOT NULL AND v_declared_weight > 0 THEN
      v_discrepancy := ABS(v_intake_weight - v_declared_weight) / v_declared_weight;

      IF v_discrepancy > 0.001 THEN
        UPDATE gold_batches SET status = 'FLAGGED' WHERE id = NEW.batch_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
