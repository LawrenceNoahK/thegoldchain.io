# THE GOLDCHAIN — Claude Code Project Context

Blockchain gold supply chain traceability platform for Ghana's Gold Board (GoldBod) under the Ghana Gold Board Act 2025 (Act 1140). Every gram of ASM gold gets a 4-node blockchain record from mine to EU refinery. Auto-generates CSDDD compliance certificates (EU Directive 2024/1760, enforcement July 26, 2028).

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui, Fira Code font |
| Database | Supabase (PostgreSQL + PostGIS + RLS + Realtime + Edge Functions) |
| Storage | Supabase Storage + AWS S3 af-south-1 (satellite GeoTIFF tiles) |
| Blockchain | Hyperledger Fabric (permissioned, Go chaincode) |
| Satellite | Google Earth Engine API + Sentinel-2 (10m, 5-day revisit) |
| Auth | Supabase Auth, JWT, role-based middleware |
| Edge | Cloudflare (DDoS, WAF) |
| Hosting | AWS af-south-1 (Cape Town) — ~55ms latency to Accra |

---

## Design System

```
Background:   #020A04  (deep forest black)
Primary:      #00FF41  (phosphor green) — with glow/shadow effects
Accent:       #D4A800  (gold sovereign)
Dim green:    #007A1F
Border:       #0D3015
Font:         Fira Code, Share Tech Mono, VT323 (monospace throughout)
Aesthetic:    Terminal / CLI — scanlines, blink cursors, CRT effects
```

Never use rounded corners > 2px. Never use sans-serif fonts. Never use white backgrounds.

---

## Database Schema

### Tables

**operators**
- id, name, license_number (MCAS), region, status (active/suspended), gps_lat, gps_lng, concession_geojson, created_at

**gold_batches**
- id, batch_id (GHB-YYYY-SEQ), operator_id, declared_weight_kg, status (PENDING / NODE_02_APPROVED / NODE_03_CONFIRMED / CERTIFIED / FLAGGED), created_at

**batch_nodes**
- id, batch_id, node_number (1–4), officer_id, timestamp, data (jsonb), tx_hash (Hyperledger), status (CONFIRMED / PENDING / FLAGGED)

**satellite_checks**
- id, batch_id, check_1_surface_disturbance, check_2_boundary_compliance, check_3_deforestation, check_4_water_proximity, check_5_volume_plausibility, check_6_anomaly_detection, overall_status, flagged_details, created_at

**csddd_certificates**
- id, batch_id, certificate_url, audit_trail_hash, qr_code_url, issued_at, node_1_tx, node_2_tx, node_3_tx

**audit_log** (append-only, never update or delete)
- id, table_name, operation, record_id, changed_by, changed_at, old_data (jsonb), new_data (jsonb)

### Roles (Supabase RLS)

| Role | Can Read | Can Write |
|---|---|---|
| `operator` | Own batches only | gold_batches, batch_nodes (node 1 only) |
| `goldbod_officer` | All batches | batch_nodes (node 2 only) |
| `refinery` | Assigned batches only | batch_nodes (node 3 only) |
| `auditor` | All records | Nothing |
| `admin` | Everything | Everything |

---

## The 4-Node Chain of Custody

```
NODE 01  Mine Production Declaration
         Actor: Licensed operator (field mobile form)
         Data:  GPS coords, declared weight, concession license
         Auto:  Satellite boundary check triggered within 24h

NODE 02  GoldBod Export Certification
         Actor: GoldBod officer (dashboard)
         Data:  MCAS license validation, assay ref, export permit
         Auto:  Blocks if license expired or satellite flag active

NODE 03  Refinery Intake Verification
         Actor: European refinery
         Data:  Intake confirmation, reconciled weight
         Auto:  Flags if weight discrepancy > 0.1%

NODE 04  CSDDD Certificate Generation
         Actor: Automated smart contract
         Data:  Full audit trail hash, all node timestamps + TX hashes
         Auto:  PDF certificate generated, stored, public verify URL created
```

---

## File Structure

```
thegoldchain/
├── CLAUDE.md                          ← you are here
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── (dashboard)/
│   │   ├── operator/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   └── declare/page.tsx      ← Node 01 field form (PWA/offline)
│   │   ├── goldbod/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx    ← live batch table + approve/flag
│   │   │   └── terminal/page.tsx     ← phosphor green terminal dashboard
│   │   └── refinery/
│   │       ├── layout.tsx
│   │       └── dashboard/page.tsx
│   └── verify/[batchId]/page.tsx     ← public CSDDD cert verify (no auth)
├── components/
│   ├── layout/                        ← sidebar, header, nav
│   ├── BatchTable.tsx
│   ├── BatchDetailPanel.tsx           ← 4-node chain visualisation
│   ├── ChainNode.tsx
│   └── TerminalDashboard.tsx
├── lib/
│   ├── supabase/                      ← client, server, middleware helpers
│   ├── declarations.ts                ← batch declaration functions
│   ├── certificates.ts                ← CSDDD cert generation
│   └── fabric.ts                      ← Hyperledger Fabric bridge
├── services/
│   └── fabric/index.ts                ← REST bridge to Fabric node
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_audit_log.sql
│   ├── functions/
│   │   ├── satellite-verify/          ← Edge Function, 6 GEE checks
│   │   └── generate-csddd-cert/       ← Edge Function, PDF + QR
│   └── seed.sql
├── fabric/
│   ├── network/                       ← Hyperledger Fabric test network
│   └── chaincode/goldchain-cc/main.go ← Go smart contract
└── public/
    └── sw.js                          ← Service Worker (offline declarations)
```

---

## Key Business Rules (enforce in all code)

1. **Batch IDs** format: `GHB-YYYY-NNNN` (e.g. GHB-2026-0001) — auto-generated, never editable
2. **Node order is strict** — Node 02 cannot be written before Node 01 is confirmed. Node 03 requires Node 02. Enforce at DB level with constraints, not just application logic.
3. **Satellite check must complete** before GoldBod officer can approve Node 02
4. **audit_log is sacred** — never add UPDATE or DELETE permissions. Append only. Daily SHA-256 hash written to Hyperledger.
5. **Weight reconciliation** — if Node 03 intake weight differs from Node 01 declared weight by >0.1%, auto-flag the batch and alert GoldBod
6. **RLS is the real security layer** — never bypass with service role key in user-facing code. Service role only in Edge Functions.
7. **All TX hashes** from Hyperledger Fabric must be stored in batch_nodes.tx_hash before the node is marked CONFIRMED

---

## Environment Variables Needed

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Edge Functions only

# Google Earth Engine
GEE_SERVICE_ACCOUNT=
GEE_PRIVATE_KEY=

# Hyperledger Fabric
FABRIC_PEER_ENDPOINT=
FABRIC_CHANNEL_NAME=goldchain
FABRIC_CHAINCODE_NAME=goldchain-cc
FABRIC_MSP_ID=GoldBodMSP
FABRIC_CERT_PATH=
FABRIC_KEY_PATH=

# AWS S3 (satellite tiles)
AWS_REGION=af-south-1
AWS_BUCKET_SATELLITE=goldchain-satellite-tiles
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## Build Modules (in order)

- [ ] **Module 1** — Supabase schema, RLS policies, seed data
- [ ] **Module 2** — Next.js scaffold, Supabase Auth, role routing, layout shell
- [ ] **Module 3** — Operator declaration form (Node 01), offline PWA, Service Worker
- [ ] **Module 4** — GoldBod officer dashboard, Realtime feed, approve/flag flow
- [ ] **Module 5** — Satellite verify Edge Function (6 GEE checks), alert on boundary violation
- [ ] **Module 6** — CSDDD certificate generation, PDF, QR code, public verify page
- [ ] **Module 7** — Terminal dashboard wired to live Supabase data
- [ ] **Module 8** — Hyperledger Fabric local network, Go chaincode, TX hash on certs

---

## Gyamfi Demo Checklist (5 proofs needed)

- [ ] Operator declares batch on mobile → TX hash appears in < 3s
- [ ] Satellite boundary check runs → pass/fail on GoldBod dashboard
- [ ] GoldBod officer approves → chain advances to 50%
- [ ] Batch hits Node 03 → CSDDD PDF certificate auto-generated with QR code
- [ ] Terminal dashboard live with real data from demo session

---

## Context

- **Client:** Ghana Gold Board (GoldBod), CEO Sammy Gyamfi Esq.
- **Regulation:** Ghana Gold Board Act 2025 (Act 1140), EU CSDDD Directive 2024/1760
- **CSDDD deadline:** July 26, 2028 (878 days from March 2026)
- **Company:** LNK Engineering Ltd — contact@thegoldchain.io
- **Repo is private** — do not reference Anthropic, Claude, or AI in any user-facing UI copy
