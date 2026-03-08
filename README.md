# THE GOLDCHAIN

**Blockchain Traceability for Ghana's Gold Supply Chain**

Ghana Gold Board Act 2025 (Act 1140) · EU CSDDD Directive 2024/1760 · Hyperledger Fabric

---

## The Problem

Ghana exported **$11.6B in gold in 2024** — Africa's largest producer. But there is no digital record of where that gold came from, whether it was mined legally, or whether it crossed a licensed boundary.

- **No digital chain of custody** — gold origin cannot be verified from mine to refinery. Smuggling estimate: $2B+ per year (EITI 2024).
- **No satellite boundary monitoring** — licensed perimeter violations go undetected. Galamsey operations continue adjacent to legal concessions.
- **No EU CSDDD compliance infrastructure** — European refiners face mandatory supply chain due diligence by July 2028 or **5% global turnover penalties**. Ghana gold risks exclusion from premium markets.

## The Solution

THE GOLDCHAIN writes every gram of gold onto an immutable blockchain ledger from the moment it leaves the ground. Four nodes. Four verifications. One tamper-proof certificate.

```
NODE 01  Mine Production Declaration
         Actor:  Licensed ASM operator (field mobile form)
         Data:   GPS coordinates, declared weight, concession license
         Auto:   Sentinel-2 satellite boundary check triggered within 24h

NODE 02  GoldBod Export Certification
         Actor:  GoldBod officer (regulatory dashboard)
         Data:   MCAS license validation, assay reference, export permit
         Auto:   Smart contract blocks if license expired or satellite flag active

NODE 03  Refinery Intake Verification
         Actor:  European refinery
         Data:   Intake confirmation, reconciled weight
         Auto:   Flags if weight discrepancy > 0.1%, triggers GoldBod notification

NODE 04  CSDDD Certificate Generation
         Actor:  Automated smart contract
         Data:   Full audit trail hash, all node timestamps + TX hashes
         Auto:   EU CSDDD-compliant PDF certificate with QR code, public verify URL
```

---

## Regulatory Context

| Regulation | Detail |
|---|---|
| **Ghana Gold Board Act 2025 (Act 1140)** | Establishes GoldBod as the sole legal aggregator of all ASM gold. Creates non-discretionary demand for digital traceability infrastructure. |
| **EU CSDDD Directive 2024/1760** | Requires European companies to conduct mandatory supply chain due diligence. Penalties up to 5% of global annual turnover. Full enforcement: **July 26, 2028**. |

> *"By 2026, GoldBod will introduce a blockchain-powered Track and Trace system for full traceability of every gram of gold."*
> — **Sammy Gyamfi, Esq.**, CEO Ghana Gold Board · Dubai Precious Metals Conference 2025

---

## Technical Architecture

### Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, shadcn/ui | SSR critical for Ghana's variable network conditions. Progressive loading prevents white screens on slow connections. |
| Database | Supabase (PostgreSQL + PostGIS + RLS + Realtime) | Row Level Security enforces multi-tenant data isolation at the database layer. Fully open-source and self-deployable for in-country sovereignty. |
| Storage | Supabase Storage + AWS S3 af-south-1 | CSDDD certificates, assay PDFs, Sentinel-2 GeoTIFF satellite tiles (500MB–1GB per tile). |
| Blockchain | Hyperledger Fabric (permissioned, Go chaincode) | GoldBod controls the Certificate Authority. No cryptocurrency, no anonymous actors. Enterprise-proven (IBM Food Trust, De Beers Tracr, TradeLens). |
| Satellite | Google Earth Engine API + Sentinel-2 | 10m spatial resolution, 5-day revisit cycle over Ghana. Free via ESA Copernicus. |
| Auth | Supabase Auth, JWT, role-based middleware | Per-route authorization, rate limiting (100 req/min per operator IP). |
| Edge | Cloudflare (DDoS, WAF, OWASP ruleset) | Africa PoP caching for dashboard performance. |
| Hosting | AWS af-south-1 (Cape Town) | ~55ms latency to Accra. Outperforms Azure South Africa North by 10–20ms. |
| Mobile | PWA with Service Worker | Offline capability for field operators in low-connectivity mine sites. |

### Why Hyperledger Fabric

- **Permissioned network** — GoldBod controls the Certificate Authority; no anonymous actors can join the ledger
- **No cryptocurrency** — transactions validated by known, permissioned peers only
- **Deterministic consensus** — Crash Fault Tolerant (CFT) via Raft ordering; transactions are final
- **Enterprise-proven** — IBM Food Trust (Walmart), De Beers Tracr, TradeLens (Maersk), HSBC trade finance
- **Chaincode in Go** — smart contracts compiled and deployed to GoldBod-controlled peers
- **Sovereign control** — GoldBod holds the root Certificate Authority; all network members issued X.509 certificates signed by GoldBod

### Satellite Verification Pipeline

Six automated checks run against every mine declaration using Sentinel-2 imagery via Google Earth Engine:

| Check | Method |
|---|---|
| **Active Surface Disturbance** | NDVI change detection between current and 30-day prior image. Bare earth signature confirms active mining. |
| **Boundary Compliance** | Licensed concession GeoJSON (from MCAS) overlaid on satellite image. Pixel-level detection of activity outside perimeter. |
| **Deforestation Detection** | Hansen Global Forest Change dataset cross-reference. Canopy loss within or adjacent to concession triggers ESG risk flag. |
| **Water Proximity** | JRC Global Surface Water dataset. Mining activity within 200m of water body flagged for GoldBod review. |
| **Volume Plausibility** | Disturbed surface area (sq km) cross-referenced against declared production volume. Statistical outliers flagged. |
| **Historical Anomaly Detection** | 12-month rolling baseline comparison. Production spikes >3 standard deviations from historical mean trigger automatic review. |

### Security Architecture (Six Layers)

| Layer | Implementation |
|---|---|
| **Edge / Network** | Cloudflare DDoS mitigation, WAF (OWASP ruleset), Africa PoP caching |
| **Application** | Next.js middleware: JWT verification on every request, role extraction, per-route authorization |
| **Database** | Supabase Row Level Security: every query filtered by authenticated user role. Operators cannot access other operators' data. |
| **Blockchain Identity** | Hyperledger Fabric MSP: every transaction signed with X.509 certificate. Non-repudiation guaranteed. |
| **Audit / Tamper Evidence** | Append-only audit log. Daily SHA-256 hash written to Hyperledger Fabric. Retroactive modifications produce detectable hash mismatch. |
| **Encryption** | AES-256 at rest (Supabase + S3). TLS 1.3 in transit. GoldBod holds master encryption keys in AWS KMS. |

---

## Database Schema

### Core Tables

| Table | Purpose |
|---|---|
| `operators` | Licensed ASM operators — MCAS license, GPS, concession GeoJSON |
| `gold_batches` | Gold batches with auto-generated `GHB-YYYY-NNNN` batch IDs |
| `batch_nodes` | 4-node chain of custody records with Hyperledger TX hashes |
| `satellite_checks` | 6 automated satellite verification results per batch |
| `csddd_certificates` | EU CSDDD compliance certificates with audit trail hash + QR code |
| `audit_log` | Append-only, never UPDATE or DELETE. Daily SHA-256 hash to Hyperledger. |

### Role-Based Access (Supabase RLS)

| Role | Read Access | Write Access |
|---|---|---|
| `operator` | Own batches only | gold_batches, batch_nodes (Node 01 only) |
| `goldbod_officer` | All batches | batch_nodes (Node 02 only) |
| `refinery` | Assigned batches only | batch_nodes (Node 03 only) |
| `auditor` | All records | Nothing |
| `admin` | Everything | Everything |

### Business Rules (enforced at DB level)

1. **Batch IDs** — `GHB-YYYY-NNNN` format, auto-generated, immutable
2. **Node order is strict** — Node 02 cannot be written before Node 01 is confirmed. Enforced by database triggers, not application logic.
3. **Satellite check must pass** before GoldBod officer can approve Node 02
4. **Audit log is sacred** — append-only, no UPDATE or DELETE permissions
5. **Weight reconciliation** — >0.1% discrepancy between Node 01 declared weight and Node 03 intake weight auto-flags the batch
6. **TX hashes required** — Hyperledger Fabric TX hash must be stored before any node is marked CONFIRMED

---

## Getting Started

```bash
npm install
cp .env.local.example .env.local
# Fill in Supabase credentials
npm run dev
```

### Environment Variables

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

## Project Structure

```
thegoldchain/
├── app/
│   ├── (auth)/login/                  Login (terminal UI)
│   ├── (dashboard)/
│   │   ├── operator/                  Operator dashboard + Node 01 declaration form
│   │   ├── goldbod/                   GoldBod officer dashboard + terminal view
│   │   └── refinery/                  Refinery intake queue
│   ├── verify/[batchId]/             Public CSDDD certificate verification (no auth)
│   └── api/auth/callback/            OAuth callback handler
├── components/layout/                 Sidebar, Header, DashboardShell
├── lib/
│   └── supabase/                      Client, server, middleware helpers
├── supabase/
│   ├── migrations/                    Schema, RLS policies, audit log
│   ├── functions/                     Edge Functions (satellite verify, cert generation)
│   └── seed.sql                       Demo data (3 operators, 3 batches)
├── fabric/
│   ├── network/                       Hyperledger Fabric test network
│   └── chaincode/goldchain-cc/        Go smart contract
└── public/
    └── sw.js                          Service Worker (offline declarations)
```

---

## Infrastructure Cost Model

| Phase | Monthly Cost |
|---|---|
| **Pilot (90 days)** | ~$10–50 |
| **Year 1** | ~$150–300 |
| **Year 2** | ~$800–1,200 |

Built on free tiers where possible: Supabase free tier (pilot), Google Earth Engine (free), Cloudflare (free), Sentinel-2 imagery (free via ESA Copernicus).

---

## Data Sovereignty

Supabase is fully open-source (MIT licensed) and self-deployable. If GoldBod requires full in-country data sovereignty, the entire stack can be deployed inside a GoldBod-controlled data centre in Accra with zero code changes. GoldBod holds master encryption keys via AWS KMS — no foreign entity can decrypt Ghana's gold data.

---

## License

Proprietary. All rights reserved.

**LNK Engineering Ltd** — contact@thegoldchain.io
