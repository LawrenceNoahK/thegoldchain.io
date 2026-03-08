# THE GOLDCHAIN — Claude Code Project Context

Blockchain gold supply chain traceability platform for Ghana's Gold Board (GoldBod) under the Ghana Gold Board Act 2025 (Act 1140). Every gram of ASM gold gets a 4-node blockchain record from mine to EU refinery. Auto-generates CSDDD compliance certificates (EU Directive 2024/1760).

**CSDDD Timeline Update (Feb 2026):** EU Omnibus I amendment narrowed scope by 70% (now 5,000+ employees, EUR 1.5B+ turnover) and pushed compliance to July 26, 2029 (member state transposition by July 26, 2028). EU refineries handling Ghanaian gold remain in scope.

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
│   │   └── login/page.tsx             ← terminal-styled login with Zod validation
│   ├── (dashboard)/
│   │   ├── operator/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   └── declare/page.tsx       ← Node 01 field form (PWA/offline)
│   │   ├── goldbod/
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx     ← live batch table + approve/flag
│   │   │   └── terminal/page.tsx      ← phosphor green terminal dashboard
│   │   └── refinery/
│   │       ├── layout.tsx
│   │       └── dashboard/page.tsx
│   ├── api/
│   │   ├── auth/callback/route.ts
│   │   └── sync/route.ts             ← offline declaration sync endpoint
│   ├── verify/[batchId]/page.tsx      ← public CSDDD cert verify (no auth)
│   ├── error.tsx                      ← global error boundary
│   └── not-found.tsx                  ← terminal-themed 404
├── components/
│   ├── layout/                        ← sidebar, header, nav
│   ├── BatchTable.tsx
│   ├── BatchDetailPanel.tsx           ← 4-node chain visualisation
│   ├── ChainNode.tsx
│   └── TerminalDashboard.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  ← browser Supabase client
│   │   ├── server.ts                  ← server Supabase client
│   │   ├── middleware.ts              ← session + RLS middleware
│   │   └── admin.ts                   ← service role client (server-only, never in components)
│   ├── actions/
│   │   ├── declarations.ts            ← Server Action: Node 01 (Zod + rate limit + role check)
│   │   ├── approvals.ts               ← Server Action: Node 02 (satellite check gate)
│   │   └── intake.ts                  ← Server Action: Node 03 (weight reconciliation)
│   ├── offline/
│   │   ├── db.ts                      ← IndexedDB wrapper (idb)
│   │   ├── queue.ts                   ← offline declaration queue + background sync
│   │   ├── hooks.ts                   ← useOnlineStatus, useOfflineDeclaration
│   │   └── hmac.ts                    ← HMAC tamper prevention for offline payloads
│   ├── validations.ts                 ← Zod schemas for all mutations
│   ├── rate-limit.ts                  ← in-memory sliding window rate limiter
│   ├── certificates.ts                ← CSDDD cert generation
│   └── fabric.ts                      ← Hyperledger Fabric bridge
├── services/
│   └── fabric/index.ts                ← REST bridge to Fabric node
├── supabase/
│   ├── migrations/
│   │   ├── 001_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   ├── 003_audit_log.sql
│   │   └── 004_offline_support.sql    ← captured_at column, relaxed tx_hash trigger
│   ├── functions/
│   │   ├── satellite-verify/          ← Edge Function, 6 GEE checks
│   │   └── generate-csddd-cert/       ← Edge Function, PDF + QR
│   └── seed.sql
├── fabric/
│   ├── network/                       ← Hyperledger Fabric test network
│   └── chaincode/goldchain-cc/main.go ← Go smart contract
└── public/
    ├── manifest.json                  ← PWA manifest
    └── sw.js                          ← Service Worker (offline declarations)
```

---

## Key Business Rules (enforce in all code)

1. **Batch IDs** format: `GHB-YYYY-NNNN` (e.g. GHB-2026-0001) — auto-generated, never editable
2. **Node order is strict** — Node 02 cannot be written before Node 01 is confirmed. Node 03 requires Node 02. Enforce at DB level with constraints, not just application logic.
3. **Satellite check must complete** before GoldBod officer can approve Node 02
4. **audit_log is sacred** — never add UPDATE or DELETE permissions. Append only. Daily SHA-256 hash written to Hyperledger.
5. **Weight reconciliation** — if Node 03 intake weight differs from Node 01 declared weight by >0.1%, auto-flag the batch and alert GoldBod
6. **RLS is the real security layer** — never bypass with service role key in user-facing code. Service role only in Edge Functions and `/api/sync` route.
7. **All TX hashes** from Hyperledger Fabric must be stored in batch_nodes.tx_hash before the node is marked CONFIRMED. Pre-Fabric: `PENDING_FABRIC` is accepted as placeholder.
8. **All mutations through Server Actions** — never direct Supabase inserts from browser. Server Actions provide automatic CSRF protection, Zod validation, rate limiting, and role verification.
9. **Offline declarations use HMAC** — payload is signed with session-derived key at capture time. Server verifies HMAC integrity on sync to prevent IndexedDB tampering.
10. **Offline `captured_at` max age: 72 hours** — server rejects declarations older than 72h (auto-flag, not reject).

---

## Security Architecture (Six Layers)

```
L1  Edge/Network     Cloudflare WAF, DDoS, OWASP ruleset, Africa PoP caching
L2  Application      CSP, HSTS, X-Frame-Options, Permissions-Policy, rate limiting
L3  Server Actions   Zod validation, role verification, CSRF (automatic in Next.js)
L4  Database         RLS policies, triggers, parameterized queries (Supabase)
L5  Blockchain       Hyperledger TX signing, X.509 certificates, non-repudiation
L6  Audit            Append-only log, daily SHA-256 hash to Hyperledger
```

### Rate Limits

| Role | Action | Limit |
|---|---|---|
| `operator` | Declarations | 10/hour |
| `goldbod_officer` | Approvals | 60/hour |
| `refinery` | Intake confirmations | 30/hour |
| Login | Auth attempts | 5/15min per IP |

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

- [x] **Module 1** — Supabase schema, RLS policies, seed data
- [x] **Module 2** — Next.js scaffold, Supabase Auth, role routing, layout shell
- [x] **Sprint 1** — Security foundation: Zod validation, Server Actions, rate limiting, CSP headers, error boundaries, next/font optimization, 004 migration
- [ ] **Sprint 2** — PWA + offline queue: Service Worker, IndexedDB, HMAC tamper prevention, background sync, `/api/sync` endpoint
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
- **CSDDD deadline:** July 26, 2029 (compliance), July 26, 2028 (member state transposition) — updated per Omnibus I (Feb 2026)
- **Company:** LNK Engineering Ltd — contact@thegoldchain.io
- **Repo is private** — do not reference Anthropic, Claude, or AI in any user-facing UI copy

---

## Ghana Gold Sector Intelligence (as of March 2026)

### Market Numbers
- 2025 ASM gold exports: **103 tonnes** (+63% YoY from 63.6t in 2024)
- 2025 total gold export earnings: **US$20.9 billion** (doubled YoY)
- Foreign reserves: **US$13.8 billion** (record high; Mahama credited GoldBod in 2026 SONA)
- Estimated smuggling losses 2019–2023: **US$11.4 billion** (Swissaid)
- 2026 ASM target: **127 tonnes/year** (2.45 tonnes/week)
- Licensed ASM operators: **15,000+** (MCAS registered)

### GoldBod Track-and-Trace Procurement
- Sammy Gyamfi announced blockchain traceability for Q1 2026, **extended to end of 2026** (procurement complexity)
- **Section 31X of Act 1140** legally mandates source-to-sale tracking
- Piloting traceability with **600 small-scale mines**
- All gold to Gold Coast Refinery must come from verified sustainable sources
- GoldBod is sole legal buyer/seller/assayer/exporter of all ASM gold (foreigners banned from local trading April 2025)

### Active Policy Developments
- **Royalty sliding scale** (5%→12%) matured in Parliament March 6, 2026. Gold above $5,000/oz hits 12%. US, China, Canada, Australia, South Africa pushing back.
- **Dubai refining crisis** (March 2026): UAE flights disrupted by US-Israel operation against Iran. Dubai refines 80% of Ghana ASM gold. GoldBod drafting contingency routes to EU and Shanghai refineries.
- **LBMA certification** push: Ghana building LBMA-standard gold analysis laboratory, expected operational 2026.
- **National task force** launched to combat gold smuggling.
- **License reform**: GoldBod suspended Tier 1, Tier 2, and Self-Financing Aggregator license applications pending reforms.

### Continental Significance
- Finance ministers from Liberia, Sierra Leone, The Gambia, Sudan praised GoldBod model at IMF-World Bank meetings
- GoldBod positioned as "Africa's next policy export" for natural resource governance
- Ghana climbed to **5th in Africa's top 25 mining destinations** (up from 10th in 2024)

### Strategic Implications for TheGoldChain
- Dubai crisis validates EU refinery route (Node 03 design)
- Royalty sliding scale increases importance of auditable weight reconciliation (Node 01 vs Node 03)
- 600-mine pilot creates immediate demand for batch-level traceability
- CSDDD certificates remain essential — EU refineries for Ghanaian gold are large enough to stay in Omnibus I scope
- Continental interest = potential scale beyond Ghana
