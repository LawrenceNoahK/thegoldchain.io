-- ============================================================
-- THE GOLDCHAIN — Seed Data (Demo / Development)
-- 3 operators, sample batches, satellite checks
-- ============================================================

-- ============================================================
-- OPERATORS (3 licensed ASM operators)
-- ============================================================

INSERT INTO operators (id, name, license_number, region, status, gps_lat, gps_lng, concession_geojson) VALUES
(
  'a1000000-0000-0000-0000-000000000001',
  'Newmont Ghana Gold Ltd',
  'MCAS-GH-2024-00147',
  'Western Region - Tarkwa',
  'active',
  5.3019,
  -2.0152,
  '{"type":"Polygon","coordinates":[[[-2.05,5.27],[-1.98,5.27],[-1.98,5.33],[-2.05,5.33],[-2.05,5.27]]]}'::JSONB
),
(
  'a1000000-0000-0000-0000-000000000002',
  'AngloGold Ashanti Ltd',
  'MCAS-GH-2024-00203',
  'Ashanti Region - Obuasi',
  'active',
  6.2000,
  -1.6667,
  '{"type":"Polygon","coordinates":[[[-1.70,6.17],[-1.63,6.17],[-1.63,6.23],[-1.70,6.23],[-1.70,6.17]]]}'::JSONB
),
(
  'a1000000-0000-0000-0000-000000000003',
  'Kinross Gold Corp',
  'MCAS-GH-2023-00089',
  'Brong-Ahafo Region - Ahafo',
  'active',
  7.0833,
  -2.3167,
  '{"type":"Polygon","coordinates":[[[-2.35,7.05],[-2.28,7.05],[-2.28,7.12],[-2.35,7.12],[-2.35,7.05]]]}'::JSONB
);

-- ============================================================
-- GOLD BATCHES (sample declarations)
-- ============================================================

-- Reset sequence
SELECT setval('gold_batch_seq', 0, false);

INSERT INTO gold_batches (id, operator_id, declared_weight_kg, status, created_at) VALUES
(
  'b2000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  12.4000,
  'NODE_02_APPROVED',
  '2026-03-01 08:00:00+00'
),
(
  'b2000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000002',
  8.2000,
  'PENDING',
  '2026-03-02 10:30:00+00'
),
(
  'b2000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000003',
  6.1000,
  'FLAGGED',
  '2026-03-03 14:15:00+00'
);

-- ============================================================
-- BATCH NODES (chain of custody entries)
-- ============================================================

-- Batch 1: Node 01 (CONFIRMED) + Node 02 (CONFIRMED)
INSERT INTO batch_nodes (batch_id, node_number, timestamp, data, tx_hash, status) VALUES
(
  'b2000000-0000-0000-0000-000000000001',
  1,
  '2026-03-01 08:00:00+00',
  '{
    "gps_lat": 5.3019,
    "gps_lng": -2.0152,
    "declared_weight_kg": 12.4,
    "concession_license": "MCAS-GH-2024-00147",
    "field_notes": "Morning extraction, Pit B-7"
  }'::JSONB,
  '0xA3F9B7C2D1E4F5A6B8C9D0E1F2A3B4C5D6E7F8A9',
  'CONFIRMED'
),
(
  'b2000000-0000-0000-0000-000000000001',
  2,
  '2026-03-02 11:30:00+00',
  '{
    "mcas_license_valid": true,
    "assay_ref": "ASSAY-2026-TKW-0147",
    "export_permit": "EXP-GH-2026-00089",
    "officer_notes": "License verified, satellite clear, approved for export"
  }'::JSONB,
  '0x7D2E1A4B8C3F9D0E5A6B7C8D9E0F1A2B3C4D5E6F',
  'CONFIRMED'
);

-- Batch 2: Node 01 only (CONFIRMED, awaiting satellite + Node 02)
INSERT INTO batch_nodes (batch_id, node_number, timestamp, data, tx_hash, status) VALUES
(
  'b2000000-0000-0000-0000-000000000002',
  1,
  '2026-03-02 10:30:00+00',
  '{
    "gps_lat": 6.2000,
    "gps_lng": -1.6667,
    "declared_weight_kg": 8.2,
    "concession_license": "MCAS-GH-2024-00203",
    "field_notes": "Shaft C-3, afternoon shift"
  }'::JSONB,
  '0xE5F6A7B8C9D0E1F2A3B4C5D6E7F8A9B0C1D2E3F4',
  'CONFIRMED'
);

-- Batch 3: Node 01 (CONFIRMED but batch FLAGGED by satellite)
INSERT INTO batch_nodes (batch_id, node_number, timestamp, data, tx_hash, status) VALUES
(
  'b2000000-0000-0000-0000-000000000003',
  1,
  '2026-03-03 14:15:00+00',
  '{
    "gps_lat": 7.0833,
    "gps_lng": -2.3167,
    "declared_weight_kg": 6.1,
    "concession_license": "MCAS-GH-2023-00089",
    "field_notes": "Open pit extraction, sector 14"
  }'::JSONB,
  '0xF1A2B3C4D5E6F7A8B9C0D1E2F3A4B5C6D7E8F9A0',
  'CONFIRMED'
);

-- ============================================================
-- SATELLITE CHECKS
-- ============================================================

-- Batch 1: All clear
INSERT INTO satellite_checks (batch_id, check_1_surface_disturbance, check_2_boundary_compliance, check_3_deforestation, check_4_water_proximity, check_5_volume_plausibility, check_6_anomaly_detection, overall_status) VALUES
(
  'b2000000-0000-0000-0000-000000000001',
  'PASS', 'PASS', 'PASS', 'PASS', 'PASS', 'PASS',
  'PASS'
);

-- Batch 2: Pending (satellite check not yet run)
INSERT INTO satellite_checks (batch_id, overall_status) VALUES
(
  'b2000000-0000-0000-0000-000000000002',
  'PENDING'
);

-- Batch 3: FLAGGED — boundary violation
INSERT INTO satellite_checks (batch_id, check_1_surface_disturbance, check_2_boundary_compliance, check_3_deforestation, check_4_water_proximity, check_5_volume_plausibility, check_6_anomaly_detection, overall_status, flagged_details) VALUES
(
  'b2000000-0000-0000-0000-000000000003',
  'PASS', 'FAIL', 'PASS', 'PASS', 'PASS', 'PASS',
  'FAIL',
  '{
    "check_2_detail": "Mining activity detected 0.8km outside licensed concession boundary (AHAFO-14 sector). 2.3 hectares of disturbance in unauthorized zone.",
    "sentinel2_scene_id": "S2A_MSIL2A_20260302T102031_N0511_R065_T30NWN",
    "analysis_timestamp": "2026-03-04T06:22:14Z",
    "encroachment_area_km2": 0.023,
    "distance_outside_boundary_km": 0.8
  }'::JSONB
);
