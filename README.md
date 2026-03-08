# THE GOLDCHAIN

Blockchain gold supply chain traceability platform for Ghana's Gold Board (GoldBod) under the **Ghana Gold Board Act 2025 (Act 1140)**.

Every gram of ASM gold gets a 4-node blockchain record from mine to EU refinery. Auto-generates CSDDD compliance certificates (EU Directive 2024/1760, enforcement July 26, 2028).

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, Fira Code |
| Database | Supabase (PostgreSQL + PostGIS + RLS + Realtime) |
| Blockchain | Hyperledger Fabric (permissioned, Go chaincode) |
| Satellite | Google Earth Engine API + Sentinel-2 |
| Auth | Supabase Auth, JWT, role-based middleware |
| Hosting | AWS af-south-1 (Cape Town) |

## 4-Node Chain of Custody

```
NODE 01  Mine Production Declaration      (Licensed operator)
NODE 02  GoldBod Export Certification      (GoldBod officer)
NODE 03  Refinery Intake Verification      (European refinery)
NODE 04  CSDDD Certificate Generation      (Automated smart contract)
```

## Getting Started

```bash
npm install
cp .env.local.example .env.local
# Fill in Supabase credentials in .env.local
npm run dev
```

## Roles

| Role | Access |
|---|---|
| `operator` | Own batches, Node 01 declarations |
| `goldbod_officer` | All batches, Node 02 approval |
| `refinery` | Assigned batches, Node 03 intake |
| `auditor` | Read-only access to all records |
| `admin` | Full access |

## Compliance

- **Ghana Gold Board Act 2025** (Act 1140)
- **EU CSDDD Directive 2024/1760** — enforcement July 26, 2028

---

LNK Engineering Ltd — contact@thegoldchain.io
