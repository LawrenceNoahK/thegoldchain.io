THE GOLDCHAIN
Technical Architecture Document
Version 1.0 -- March 2026

LNK Engineering Ltd
contact@thegoldchain.io


========================================================================
1. EXECUTIVE SUMMARY
========================================================================

TheGoldChain is a blockchain-backed gold supply chain traceability platform built for Ghana's Gold Board (GoldBod). Its purpose is narrow and specific: ensure that every gram of artisanal small-scale mining (ASM) gold exported from Ghana carries a verifiable, tamper-proof chain of custody -- from the moment it leaves the ground to the moment it arrives at a European refinery.

The platform exists at the intersection of two regulatory forces. On the Ghanaian side, the Ghana Gold Board Act 2025 (Act 1140) established GoldBod as the sole authority responsible for gold traceability, export certification, and compliance oversight. On the European side, the EU Corporate Sustainability Due Diligence Directive (CSDDD, Directive 2024/1760) requires European importers to prove that their gold supply chains are free of forced labor, environmental destruction, and conflict financing. Enforcement begins July 26, 2028.

TheGoldChain closes the gap between these two mandates. It gives Ghanaian operators and regulators a system to produce the exact compliance artifacts that European refineries need -- automatically, with blockchain-anchored proof, and with satellite verification that goes beyond paperwork.

The technical stack was chosen to serve this specific mission: Next.js 14 for a fast, offline-capable frontend that works at mining sites with spotty connectivity. Supabase (PostgreSQL + PostGIS + Row Level Security) for a database that enforces access rules at the data layer, not the application layer. Hyperledger Fabric for a permissioned blockchain where every node in the custody chain gets an immutable transaction hash. Google Earth Engine for satellite imagery that can verify, independently of any human claim, whether mining activity is occurring where and how it was declared.

This is not a generic "blockchain for supply chain" project. It is purpose-built for a single commodity (gold), a single origin country (Ghana), a single regulatory framework (Act 1140 + CSDDD), and a single workflow (the 4-node chain of custody). Every design decision flows from that specificity.


========================================================================
2. THE PROBLEM
========================================================================

Ghana is the largest gold producer in Africa and the sixth largest in the world. Roughly 35% of its gold output comes from artisanal and small-scale mining (ASM) -- operations ranging from individual prospectors to organized small mines employing dozens of workers. This is a significant economic sector: it provides livelihoods for over a million people and generates hundreds of millions in export revenue.

The traceability problem is straightforward to state and brutally hard to solve.

When gold leaves an ASM site in Ghana's Western or Ashanti regions, it passes through multiple hands before it reaches a European refinery. At each handoff, the connection between "this physical gold" and "the mine it came from" weakens. By the time gold arrives in Switzerland or Belgium, the refinery may have a certificate of origin, but that certificate is a piece of paper. It does not prove that the gold was mined within a licensed concession, that the concession boundaries were respected, that forest was not cleared illegally, or that the declared weight matches what actually left the mine.

This is not a theoretical concern. The EU estimates that 15-20% of gold entering European supply chains has traceability gaps. The CSDDD directive was written specifically to address this: starting July 26, 2028, European companies that import gold must demonstrate they have conducted due diligence on every step of their supply chain. The penalty for non-compliance is up to 5% of global net turnover.

For Ghana, the stakes are equally concrete. Gold that cannot be traced is gold that is vulnerable to smuggling, underreporting, and tax evasion. The Gold Board Act 2025 created GoldBod precisely to close these gaps -- but a regulatory mandate without a technical system is just words on paper.

TheGoldChain is the technical system. It replaces paper certificates with blockchain-anchored digital records. It replaces self-reported compliance with satellite-verified boundary checks. It replaces trust-based weight reconciliation with automated discrepancy detection. And it produces, at the end of the chain, a CSDDD compliance certificate that a European refinery can verify with a URL and a QR code.


========================================================================
3. ARCHITECTURE OVERVIEW
========================================================================

The stack was not assembled from "what is popular" but from "what does this specific problem demand." Each technology choice maps directly to a business or operational requirement.


3.1 Next.js 14 with App Router
------------------------------------------------------------------------

The frontend needed to do three things well: work offline at rural mining sites, render server-side for security-sensitive operations, and feel authoritative to regulatory users.

Next.js 14's App Router gives us React Server Components, which matter here for a non-obvious reason: the GoldBod dashboard handles sensitive batch data, and we never want to send RLS-bypassing queries from client-side JavaScript. Server Components and Server Actions let us keep Supabase queries on the server, where they run through the authenticated user's RLS policies. The client sees rendered HTML, not raw database responses.

The App Router also gives us route-based code splitting by default. The operator's mobile declaration form loads only the code for that form -- not the GoldBod dashboard, not the terminal, not the refinery intake page. On a 3G connection at a mining site in Tarkwa, this difference is measured in seconds.


3.2 Supabase (PostgreSQL + PostGIS + RLS + Realtime)
------------------------------------------------------------------------

The database choice was the most consequential architectural decision. We needed: relational data with strong constraints (node ordering, weight reconciliation), geospatial queries (concession boundary checks with PostGIS), row-level security that enforces access control at the database layer, real-time push for the GoldBod dashboard, and a managed service that works with Edge Functions.

Firebase was considered and rejected for two reasons. First, Firestore's document model cannot enforce the kind of cross-document constraints we need -- like "Node 02 cannot exist unless Node 01 is CONFIRMED and satellite_checks has a passing record for that batch." In PostgreSQL, this is a trigger function. In Firestore, it would be application-level validation that any bug could bypass. Second, Firebase's security rules are powerful but operate on individual documents. Our access patterns (e.g., "refineries can see batches that have reached NODE_02_APPROVED status or later") map naturally to SQL WHERE clauses in RLS policies but would be contorted in Firebase rules.

Supabase Realtime powers the terminal dashboard's live transaction feed. When a batch node is inserted or updated anywhere in the system, every connected GoldBod terminal receives the change within milliseconds. This is not a polling loop -- it is PostgreSQL's WAL-based change data capture, exposed through WebSockets.


3.3 Hyperledger Fabric (Permissioned Blockchain)
------------------------------------------------------------------------

We use Hyperledger Fabric, not Ethereum or any public blockchain. This is a deliberate and important choice.

A public blockchain is wrong for this use case for three reasons. First, transaction data for gold batches includes GPS coordinates, operator identities, and weight declarations -- all of which are sensitive regulatory data that should not be on a public ledger. Second, public chains have variable transaction costs and confirmation times. When an operator declares a batch in the field, the system needs a deterministic TX hash in under 3 seconds, not a gas fee auction. Third, the participants in this chain are known entities -- licensed operators, GoldBod officers, accredited refineries. There is no need for trustless consensus among anonymous parties. What we need is a tamper-proof ledger among known, permissioned participants.

Hyperledger Fabric gives us exactly that: a permissioned blockchain where the membership service provider (GoldBodMSP) controls who can submit transactions, the Go chaincode enforces business rules (node ordering, immutability), and the ledger provides cryptographic proof that a record existed at a specific time.

The chaincode (goldchain-cc, written in Go) exposes four functions: RecordBatchNode, QueryBatchHistory, VerifyTransaction, and AnchorAuditHash. Each enforces immutability -- once a node is recorded, it cannot be overwritten. The chaincode independently enforces node ordering: you cannot write Node 02 unless Node 01 exists on the ledger. This is defense-in-depth: the same rule is enforced in the PostgreSQL trigger, in the server action validation, and in the chaincode. Three independent systems must all agree before a record is created.


3.4 Google Earth Engine + Sentinel-2
------------------------------------------------------------------------

Satellite verification is what separates TheGoldChain from a glorified spreadsheet.

Self-reported data is only as trustworthy as the person reporting it. An operator declares "12.4 kg from GPS coordinates 5.3019, -2.0152 within Concession MCAS-2025-1847." How do you verify that? You look at the ground.

Sentinel-2 satellites provide 10-meter resolution multispectral imagery with a 5-day revisit cycle. This is sufficient to detect surface disturbance (mining activity), deforestation, water body proximity, and boundary violations. The 6-check satellite verification suite runs against each batch declaration, comparing declared activity against what the satellite actually shows.

The current implementation uses rule-based checks (GPS validation, concession boundary containment, weight plausibility) that operate on available data. The architecture is designed for a clean handoff to Google Earth Engine's NDVI change detection, NDWI water body analysis, and temporal anomaly detection as those integrations are built out. The data model, the API contract, and the 6-check schema are already in place.


3.5 AWS af-south-1 (Cape Town)
------------------------------------------------------------------------

Hosting in AWS's Cape Town region (af-south-1) is not a technical luxury -- it is a latency requirement. Accra to Cape Town is approximately 55ms round-trip. Accra to the nearest European AWS region (eu-west-1, Ireland) is approximately 130ms. Accra to us-east-1 is over 200ms.

For a GoldBod officer reviewing batches on the terminal dashboard with real-time updates, or an operator submitting a declaration on a mobile device with marginal connectivity, 55ms versus 200ms is the difference between "responsive" and "sluggish." At 3G speeds, the TCP handshake overhead compounds: every extra 100ms of latency adds roughly 300-500ms to a full page load due to multiple round trips for TLS, DNS, and chunked transfer.

Cloudflare sits in front for DDoS protection and WAF, adding minimal latency since Cloudflare has edge nodes in Accra itself.


========================================================================
4. THE 4-NODE CHAIN OF CUSTODY
========================================================================

The entire system revolves around a single workflow: a gold batch moves through exactly four nodes, in strict order, with each node adding an immutable record to the chain. This is not a flexible workflow engine -- the rigidity is the point. Gold traceability does not benefit from configurability. It benefits from predictability, auditability, and enforcement.


4.1 Node 01: Mine Production Declaration
------------------------------------------------------------------------

WHO: A licensed ASM operator, typically on a mobile device at or near the mining site.

WHAT: The operator declares a gold batch with three pieces of data: the declared weight in kilograms (to four decimal places), GPS coordinates (captured automatically from the device, with manual override), and optional field notes.

WHY: This is the first link in the chain. If this record does not exist, nothing else can happen. The batch_id is auto-generated by a PostgreSQL sequence trigger (format: GHB-YYYY-NNNN, e.g., GHB-2026-0001). The operator cannot choose or modify this ID -- it is assigned by the database, making the sequence tamper-evident. If batch GHB-2026-0042 exists but GHB-2026-0041 does not, that gap is immediately visible.

HOW: The operator fills out a form in the declare page (/operator/declare). On submit, the system branches based on connectivity:

Online path: The declareAction server action validates input with Zod, verifies the user's role is "operator" via their profile, checks rate limits (10 declarations per hour per user), inserts a gold_batches row (the batch_id trigger fires), submits to Hyperledger Fabric via submitBatchNode, and inserts a batch_nodes row with the resulting TX hash. The server action returns the batch_id and TX hash to the client.

Offline path: The declaration is signed with an HMAC using a server-issued secret (fetched while online, cached in memory only -- never persisted to IndexedDB), assigned an idempotency key (SHA-256 of the payload to prevent double-submission), and stored in IndexedDB. When connectivity returns, the queue drains automatically: each declaration is sent to the /api/sync endpoint with a fresh auth token retrieved from the current Supabase session. HTTP 409 (conflict) responses are treated as success (duplicate already synced). HTTP 401 triggers a re-login prompt. The Service Worker registers a Background Sync event as a fallback for browser-level offline recovery.

The GPS auto-capture on mount and the auto-generated batch ID mean the operator's workflow is: open page, type weight, tap submit. Satellite verification triggers automatically within 24 hours.


4.2 Node 02: GoldBod Export Certification
------------------------------------------------------------------------

WHO: A GoldBod officer, working from the dashboard or terminal interface.

WHAT: The officer reviews the batch declaration, checks the satellite verification results, validates the operator's MCAS license, and either approves or flags the batch.

WHY: This is the regulatory gatekeep. GoldBod is the statutory authority under Act 1140 -- no gold can be certified for export without their sign-off. The system enforces that satellite verification must complete and pass before Node 02 can be written. This is not just application logic: the enforce_node_order() database trigger checks for a satellite_checks row with overall_status != 'PENDING' and raises an exception if the satellite check has FAILED. A GoldBod officer cannot approve a batch that the satellite has flagged, even if they try to bypass the UI and call the API directly.

HOW: The approveAction server action performs 7 checks before writing: Zod validation, authentication, role verification (must be goldbod_officer), rate limiting (60 approvals/hour), batch status check (must be PENDING), satellite check verification (must exist and must pass), and operator license lookup. Only then does it submit to Fabric and insert the Node 02 batch_node. The database trigger update_batch_status (running as SECURITY DEFINER) automatically advances the batch status to NODE_02_APPROVED.

Flag handling has its own dedicated action -- flagReviewAction -- which gives officers three options: OVERRIDE (moves batch back to PENDING, officer takes personal responsibility), REJECT (permanently marks the batch as rejected), or ESCALATE (keeps the FLAGGED status but records escalation notes). Every flag review decision is recorded in the batch_nodes table with full attribution.


4.3 Node 03: Refinery Intake Verification
------------------------------------------------------------------------

WHO: The first refinery that receives the gold shipment. Defaults to Gold Coast Refinery (GCR) -- operational since February 4, 2026, in which GoldBod holds a 15% free-carried interest. Under current Ghanaian policy, raw gold exports are being phased out by end of 2026, so GCR is the mandated first stop. European refineries become a downstream/secondary intake. The Node 03 record carries a refinery_type field ("GCR" | "EU" | "OTHER") and an optional refinery_name (required when refinery_type is OTHER) -- refinery identity is data on the node, not topology, so the 4-node chain stays fixed.

WHAT: The refinery confirms the intake weight of the received gold and the system automatically reconciles it against the declared weight from Node 01.

WHY: This is the anti-skimming check. Gold is dense, valuable, and fungible -- it is the ideal commodity for weight manipulation during transit. If an operator declares 12.4000 kg at the mine and the refinery receives 12.3800 kg, that 20-gram discrepancy (0.16%) exceeds the 0.1% threshold and the batch is automatically flagged. At current gold prices, 20 grams is roughly $1,700. The auto-flag ensures that no one -- not the operator, not the officer, not the refinery -- can quietly absorb a "transit loss."

HOW: The intakeAction server action validates the refinery user's role, confirms the batch is at NODE_02_APPROVED status, and pre-calculates the weight discrepancy to warn the user before submission. But the real enforcement happens in the database: the check_weight_reconciliation trigger function (running as SECURITY DEFINER) computes ABS(intake_weight - declared_weight) / declared_weight and, if the result exceeds 0.001 (0.1%), updates the batch status to FLAGGED and annotates the node data with the exact discrepancy percentage.

The SECURITY DEFINER modifier is critical here. The refinery user has RLS permissions to INSERT into batch_nodes (Node 3 only), but they do NOT have UPDATE permissions on gold_batches. The trigger function runs in superuser context, bypassing RLS, to perform what is a system-level state transition rather than a user-initiated write.


4.4 Node 04: CSDDD Certificate Generation
------------------------------------------------------------------------

WHO: Automated. Triggered by a GoldBod officer or admin after Node 03 is confirmed.

WHAT: The system generates a CSDDD compliance certificate containing: a SHA-256 audit trail hash computed from all node data (batch_id, declared weight, and every node's TX hash, timestamp, and data payload), all three node TX hashes from Hyperledger Fabric, and a public verification URL.

WHY: This is the compliance artifact. When a European refinery is audited under CSDDD, they need to produce evidence that their gold supply chain was subject to adequate due diligence. This certificate is that evidence. It contains a cryptographic hash that can be independently verified against the blockchain, a URL that anyone (auditor, regulator, civil society organization) can visit to verify the batch's chain of custody, and the individual TX hashes for each node that can be checked against the Hyperledger ledger.

HOW: The certifyAction server action is the most rigorous in the system. It verifies that confirmed nodes exist for all three preceding nodes, checks that none of the TX hashes are still "PENDING_FABRIC" (meaning the Fabric bridge has not yet processed them), confirms the batch is not flagged or rejected, and checks that no certificate already exists for this batch. It then generates the audit trail hash using SHA-256, submits Node 04 to Fabric, inserts the batch_node, creates the csddd_certificates row with the verify URL, and updates the batch status to CERTIFIED.

The certificate URL points to the public verify page (/verify/[batchId]), which requires no authentication -- anyone with the URL or QR code can verify the batch.


========================================================================
5. DATABASE ARCHITECTURE
========================================================================

The PostgreSQL schema is not just a data store -- it is an enforcement layer. Business rules that are "too important to be bugs" are encoded as database constraints, triggers, and RLS policies.


5.1 Batch ID Generation
------------------------------------------------------------------------

Batch IDs follow the format GHB-YYYY-NNNN (e.g., GHB-2026-0001). This is generated by a BEFORE INSERT trigger on gold_batches using a PostgreSQL sequence (gold_batch_seq). The format is human-readable (operators and officers can cite batch IDs verbally), sortable by year, and tamper-evident -- gaps in the sequence are immediately visible and auditable.

The batch_id column has a UNIQUE constraint and is never editable after creation. The trigger only fires WHEN (NEW.batch_id IS NULL), meaning the application does not set the ID -- the database does. This eliminates an entire class of bugs where application code might generate duplicate or out-of-sequence IDs.


5.2 Node Ordering Enforcement
------------------------------------------------------------------------

The enforce_node_order() trigger runs BEFORE INSERT on batch_nodes and implements three checks:

1. Node 1 can always be inserted (it is the starting point).
2. For Nodes 2-4, the previous node must exist AND have status = 'CONFIRMED'. You cannot skip from Node 01 to Node 03.
3. Node 2 specifically requires a satellite_checks row that is not PENDING and not FAIL.

This is the same rule enforced in the chaincode and in the server actions, but the database trigger is the backstop. Even if someone bypasses the application layer entirely and issues raw SQL through the Supabase client, the trigger will reject the insert.

The batch_nodes table also has a UNIQUE constraint on (batch_id, node_number), ensuring that each node can only be written once per batch. Combined with the immutability check in the chaincode (which rejects PutState if the key already exists), this provides two independent guarantees of write-once semantics.


5.3 The Sacred Audit Log
------------------------------------------------------------------------

The audit_log table is append-only by design:

    REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
    REVOKE UPDATE, DELETE ON audit_log FROM authenticated;
    REVOKE UPDATE, DELETE ON audit_log FROM anon;

No user, no role, no application can modify or delete an audit log entry. The audit_trigger_func() runs as SECURITY DEFINER (superuser context) and is attached to every tracked table: operators, gold_batches, batch_nodes, satellite_checks, and csddd_certificates. Every INSERT, UPDATE, and DELETE on these tables generates an audit_log row capturing the table name, operation, record ID, the user who made the change (via auth.uid()), and the full before/after JSONB payloads.

A companion function, compute_daily_audit_hash(), computes a SHA-256 hash of all audit entries for a given day. This hash is designed to be anchored daily to Hyperledger Fabric via the AnchorAuditHash chaincode function. If anyone modifies the audit_log table directly (which would require database superuser access), the hash will no longer match the blockchain anchor, and the tampering will be detectable.


5.4 RLS as the Security Layer
------------------------------------------------------------------------

Row Level Security is not a convenience feature in this system -- it is the primary access control mechanism. The CLAUDE.md specification states: "RLS is the real security layer -- never bypass with service role key in user-facing code."

Every table has RLS enabled. The policies are granular:

- Operators can only see their own batches (WHERE operator_id = get_user_operator_id()).
- Refineries can only see batches that have reached NODE_02_APPROVED or later.
- Operators can only write batch_nodes where node_number = 1.
- GoldBod officers can only write batch_nodes where node_number = 2.
- Refineries can only write batch_nodes where node_number = 3.
- Auditors can read everything but write nothing.
- The audit_log has no INSERT policy for users -- only the SECURITY DEFINER trigger can write to it.

The helper functions get_user_role() and get_user_operator_id() are themselves marked SECURITY DEFINER and STABLE, so they can read the profiles table regardless of the calling user's RLS context. This avoids infinite recursion (user needs to read their profile to determine their role, but their role determines what they can read).


5.5 SECURITY DEFINER on Triggers
------------------------------------------------------------------------

Several trigger functions require SECURITY DEFINER:

- update_batch_status(): When a refinery user inserts Node 03, the trigger needs to UPDATE gold_batches.status to NODE_03_CONFIRMED. But the refinery role has no UPDATE policy on gold_batches. Without SECURITY DEFINER, the trigger would silently fail, and the batch status would never advance.

- check_weight_reconciliation(): Same pattern -- the trigger needs to UPDATE gold_batches.status to FLAGGED if the weight discrepancy exceeds 0.1%.

- audit_trigger_func(): Must INSERT into audit_log, which has no user-facing INSERT policy.

This is not a security hole. These are system-level state transitions that happen as a consequence of a user's permitted action (inserting a batch_node they are authorized to write). The trigger is the system responding to a valid event, not a user bypassing access control.


========================================================================
6. SECURITY ARCHITECTURE
========================================================================


6.1 Role-Based Access Control
------------------------------------------------------------------------

Five roles, each with precisely scoped permissions:

OPERATOR: Can read their own batches and batch nodes. Can create gold_batches (own operator_id only) and batch_nodes (Node 1 only). Cannot see other operators' data, cannot approve batches, cannot generate certificates.

GOLDBOD_OFFICER: Can read all batches, all nodes, all satellite checks, and all audit logs. Can write batch_nodes (Node 2 only). Can trigger satellite verification and certificate generation. This is the regulatory power role.

REFINERY: Can read batches that have reached NODE_02_APPROVED or later. Can write batch_nodes (Node 3 only). Cannot see batches still in PENDING status -- they have no business knowing about gold that has not been export-certified yet.

AUDITOR: Can read everything -- batches, nodes, satellite checks, audit logs. Can write nothing. This is a pure observation role, designed for external auditors and oversight bodies.

ADMIN: Full read/write access. Used for system administration, not day-to-day operations.


6.2 Middleware Route Protection
------------------------------------------------------------------------

Next.js middleware (middleware.ts) enforces route-level access control:

- Public routes (/verify/*, /login, /api/auth/*, static assets, sw.js) pass through without authentication.
- All other routes require an authenticated user.
- Dashboard routes (/operator/*, /goldbod/*, /refinery/*) check the user's role from the profiles table and redirect to the appropriate dashboard if the user tries to access a section they do not belong to.

This is defense-in-depth: even if a component does not check the user's role, the middleware prevents it from being reached.


6.3 Service Role Key Isolation
------------------------------------------------------------------------

The Supabase service role key (which bypasses all RLS) is never used in user-facing code. It exists in two places only:

1. Edge Functions (satellite-verify, generate-csddd-cert), which run in Supabase's serverless environment and are never exposed to the client.
2. The admin client (createAdminClient), used only by the rate limiter to write to the rate_limit_checks table, which is a system table that users do not interact with.

Every server action uses createClient(), which creates a Supabase client bound to the current user's session. All queries go through RLS.


6.4 Rate Limiting
------------------------------------------------------------------------

Every server action is rate-limited:

- Declarations: 10 per hour per user (prevents queue flooding)
- Approvals: 60 per hour per user (allows reasonable batch processing)
- Intakes: 30 per hour per user
- Satellite verifications: 60 per hour per user
- Certificate generation: 30 per hour per user
- Flag reviews: 30 per hour per user

Rate limits are stored in a Supabase table (rate_limit_checks) for persistence across deploys and horizontal scaling. If the database is unavailable, a graceful fallback to in-memory rate limiting ensures the server action does not crash -- it just loses cross-instance persistence.


========================================================================
7. OFFLINE-FIRST ARCHITECTURE
========================================================================

Mining sites in Ghana's Western and Ashanti regions do not have reliable internet connectivity. Some have 3G. Some have intermittent 2G. Some have nothing until the operator drives to the nearest town. If the system requires connectivity to create a declaration, it will fail the operators who need it most.


7.1 The Offline Declaration Flow
------------------------------------------------------------------------

When an operator opens the declaration form (/operator/declare), the page checks navigator.onLine and displays the current connectivity status prominently. The HMAC signing secret is pre-fetched from the server while the user is online and cached in memory (never in IndexedDB, never in localStorage -- only in the JavaScript heap, which is cleared on page close).

When the operator submits a declaration while offline:

1. The form captures the declaration payload (weight, GPS, notes) and a captured_at timestamp.
2. The payload is signed with HMAC-SHA256 using the pre-fetched secret. This signature travels with the declaration and is verified server-side at sync time. If anyone modifies the payload in IndexedDB between creation and sync, the HMAC will not match and the server will reject it.
3. An idempotency key is generated (SHA-256 of the serialized payload). This prevents the same declaration from being submitted twice if the sync fires multiple times.
4. The declaration is stored in IndexedDB with status "pending."
5. If the browser supports Background Sync, a sync event is registered with tag "goldchain-declarations."

The IndexedDB schema (goldchain-offline database, version 2) uses an auto-incrementing primary key with indexes on status (for retrieving pending items), createdAt (for ordering), and idempotencyKey (unique, for deduplication).


7.2 Sync on Reconnection
------------------------------------------------------------------------

When connectivity returns, two mechanisms trigger sync:

First, the useOfflineDeclaration hook listens for the "online" window event. When fired, it re-fetches the HMAC secret (in case it expired during the offline period), then calls drainQueue().

Second, the Service Worker's sync event handler fires for the "goldchain-declarations" tag. However, the Service Worker cannot access the Supabase auth session (it runs in a separate context from the page). So instead of attempting to sync directly, it sends a postMessage to all connected clients with type "SYNC_REQUESTED", delegating the actual sync to the main thread where the auth session is available.

The drainQueue() function retrieves a fresh access_token from the current Supabase session (never stored, always fetched live), then iterates through pending declarations, sending each to /api/sync with the auth token, HMAC, and idempotency key. A 15-second timeout (SYNC_TIMEOUT_MS) accommodates slow 3G networks. Each declaration's status is updated individually -- a failure on one does not prevent the others from syncing.


7.3 Service Worker Caching
------------------------------------------------------------------------

The Service Worker (public/sw.js) implements two caching strategies:

Cache-first for static assets: Next.js build output (_next/static/*) and font files are served from cache immediately, with network fetch as fallback. This ensures the app shell loads instantly even on slow connections.

Network-first for dynamic content: HTML pages and Supabase REST API responses try the network first, fall back to cached versions if offline. Cached responses include a sw-cached-at header for age checking, though stale responses are served anyway when there is no alternative ("better than nothing" is the philosophy).

API routes and non-GET requests are never cached -- they pass through to the network directly.


========================================================================
8. BLOCKCHAIN INTEGRATION
========================================================================


8.1 The Go Chaincode
------------------------------------------------------------------------

The smart contract (fabric/chaincode/goldchain-cc/main.go) is a Go program implementing the Fabric ContractAPI. It defines two data structures -- BatchNode and AuditHash -- and four functions:

RecordBatchNode: The core write operation. Accepts a JSON payload with batchId, nodeNumber, officerId, status, and data. Key format on the ledger: BATCH_{batchId}_NODE_{nodeNumber}. Before writing, it enforces three invariants: the nodeNumber must be 1-4, the previous node must already exist on the ledger (checked via GetState), and the current node must not already exist (no overwrites). The TX ID from ctx.GetStub().GetTxID() is embedded in the record itself, creating a self-referencing proof.

QueryBatchHistory: Reads all four possible nodes for a given batchId and returns them as a JSON array. This is a read-only (evaluate) operation that does not create a transaction.

VerifyTransaction: Checks whether a given TX hash exists on the ledger. In the current implementation, this is a scaffold for composite key indexing in production.

AnchorAuditHash: Stores a daily audit log hash with key format AUDIT_{date}. Like batch nodes, these are immutable -- once anchored, an audit hash for a given date cannot be overwritten.


8.2 The Stub Mode Bridge
------------------------------------------------------------------------

The Fabric bridge (lib/fabric.ts) implements a dual-mode architecture. When FABRIC_PEER_ENDPOINT is set, it communicates with a live Fabric peer via the Gateway REST API. When it is not set (development, testing, demo), it operates in "stub mode."

Stub mode generates deterministic TX hashes: SHA-256 of the payload plus a timestamp, prefixed with "0x" to produce a 66-character string (0x + 64 hex chars). These hashes are syntactically valid and unique, allowing the entire application to function without a running Fabric network. The FabricTxResult type includes a stub: boolean field so that consuming code can distinguish between real and stub transactions.

The bridge also includes a batch processor (processPendingNodes) that scans for batch_nodes with tx_hash = "PENDING_FABRIC" and submits them to the Fabric network. This handles the edge case where a node was created while Fabric was temporarily unavailable.


8.3 Daily Audit Hash Anchoring
------------------------------------------------------------------------

The audit_log table's daily hash (computed by compute_daily_audit_hash() in PostgreSQL) is designed to be anchored to Fabric via the anchorAuditHash() bridge function. This creates a cross-system integrity check: the PostgreSQL audit_log can be independently verified against the Fabric ledger. If someone with database superuser access modified audit_log entries, the hash would no longer match the anchored value.


========================================================================
9. SATELLITE VERIFICATION
========================================================================

The satellite verification system runs six independent checks against each batch's declared mining activity. The architecture separates the check framework (which is implemented and operational) from the imagery analysis (which is designed for Google Earth Engine integration).


9.1 The Six Checks
------------------------------------------------------------------------

CHECK 1 -- Surface Disturbance: Does the declared GPS location show evidence of active mining? In production, this compares pre/post NDVI (Normalized Difference Vegetation Index) change on Sentinel-2 bands to detect exposed earth at the declared coordinates. Current implementation: PASS if GPS coordinates are provided (indicating the operator is reporting from an active site).

CHECK 2 -- Boundary Compliance: Is the mining activity within the licensed concession perimeter? In production, this overlays the GPS coordinates and an activity heatmap against the operator's concession GeoJSON polygon. Current implementation: PASS if the GPS coordinates fall within Ghana's bounding box (latitude 4.5-11.2, longitude -3.3-1.2).

CHECK 3 -- Deforestation: Has unauthorized forest clearing occurred in the concession area? In production, this performs NDVI time-series analysis comparing current vegetation cover to historical baselines, flagging forest loss exceeding 0.1 hectares. Current implementation: PASS (requires historical imagery comparison).

CHECK 4 -- Water Proximity: Is the mining activity maintaining required buffer zones from water bodies? In production, this uses NDWI (Normalized Difference Water Index) band analysis to identify water bodies and measures distance from the mining activity. Current implementation: PASS (requires water body dataset).

CHECK 5 -- Volume Plausibility: Is the declared weight consistent with the observable surface disturbance? In production, this estimates the excavated area from satellite imagery and compares it to the declared weight using alluvial gold density models. Current implementation: FAIL if declared weight exceeds 5,000 kg (unusually large for ASM operations).

CHECK 6 -- Anomaly Detection: Are there unusual patterns suggesting illicit activity? In production, this uses ML models on temporal patterns (nighttime activity from thermal bands, rapid concession expansion, seasonal anomalies). Current implementation: FAIL if the operator's status is "suspended."


9.2 Integration Architecture
------------------------------------------------------------------------

The satellite verification action (satelliteVerifyAction) is triggered by GoldBod officers. It fetches the batch with its operator data (including concession_geojson) and Node 01 data (including GPS coordinates), verifies no existing satellite check exists for the batch (enforced by a UNIQUE constraint on satellite_checks.batch_id), runs the six checks, and inserts the results.

If the overall status is FAIL, the batch is automatically flagged. This happens at the application level (the action updates gold_batches.status) and is reinforced at the database level (the enforce_node_order trigger blocks Node 02 creation if satellite_checks has a FAIL record).

The concession_geojson field on the operators table stores the licensed mining area as a GeoJSON polygon. PostGIS is enabled in the database for future spatial queries (point-in-polygon containment checks, distance calculations to water bodies, area computations for volume plausibility). The extension is loaded but the spatial queries are reserved for when the GEE integration provides real coordinate-level analysis.


========================================================================
10. THE TERMINAL DASHBOARD
========================================================================


10.1 Why a Terminal Aesthetic
------------------------------------------------------------------------

The terminal/CLI visual design is not decorative whimsy. It is a deliberate UX decision rooted in the audience and the message.

The primary users of the GoldBod dashboard are regulatory officers and government officials. The interface needs to signal authority, precision, and seriousness. A pastel-colored dashboard with rounded cards and friendly illustrations would undermine the gravitas of a system that is, functionally, a law enforcement tool. The terminal aesthetic -- phosphor green text on dark backgrounds, monospace fonts, scanline effects, blinking cursors -- communicates "system of record," not "startup MVP."

The design system is strict: background #020A04 (deep forest black), primary #00FF41 (phosphor green with glow effects), accent #D4A800 (gold sovereign), never rounded corners above 2px, never sans-serif fonts, never white backgrounds. Fira Code is the primary font, with Share Tech Mono and VT323 for variation. CRT effects (scanlines, vignette, glow text-shadows) are applied with restraint -- enough to establish the aesthetic without impeding readability.


10.2 Interactive CLI
------------------------------------------------------------------------

The terminal page (/goldbod/terminal) includes a functional command-line interface. GoldBod officers can type commands and receive live data from Supabase:

- help: Lists available commands
- stats: Shows aggregate metrics (batch counts by status, total weight, operator count)
- operators: Lists active operators with license numbers and regions
- trace [batchId]: Shows the full chain of custody for a specific batch
- verify [batchId]: Displays satellite check results
- certify [batchId]: Triggers CSDDD certificate generation
- satellite [batchId]: Triggers satellite verification
- csddd: Shows CSDDD compliance countdown and statistics
- clear: Clears the terminal output

This is not a gimmick. For power users (which regulatory officers typically become), a CLI is faster than clicking through a GUI. Typing "trace GHB-2026-0042" is faster than navigating to a batch list, finding the batch, and clicking to expand its details.


10.3 Realtime Subscriptions
------------------------------------------------------------------------

The terminal page subscribes to Supabase Realtime on three tables: gold_batches, batch_nodes, and satellite_checks. Any change to any of these tables triggers a data refresh and adds an entry to the live transaction feed.

The transaction feed displays a rolling list of events with color-coded labels: DECLARE (green), CERTIFY (cyan), VERIFY (amber), EXPORT (gold), FLAG (red), CSDDD (lime), APPROVE (mid-green), INTAKE (cyan). Each entry shows the timestamp, event code, description, and TX hash (truncated for display, with a popover showing the full hash and associated blockchain data).

Boot messages on page load establish the terminal personality:

    THE GOLDCHAIN TERMINAL v1.0.0
    ──────────────────────────────────────────────────────
    Ghana Gold Board Act 2025 (Act 1140)
    EU CSDDD Directive 2024/1760 Compliant
    Connected to Supabase Realtime
    Type 'help' for available commands


========================================================================
11. WHAT IS NEXT
========================================================================

The core system -- the 4-node chain, offline declarations, satellite verification framework, database enforcement, blockchain integration, terminal dashboard, and CSDDD certificate generation -- is built and functional. What remains is depth work and production hardening.


11.1 Google Earth Engine Integration
------------------------------------------------------------------------

The six satellite checks currently use rule-based logic on available data. The architecture is ready for GEE API integration: each check is an independent function that receives coordinates, concession geometry, and declared weight, and returns PASS/FAIL. Swapping in NDVI change detection, NDWI water analysis, and temporal anomaly ML models requires no schema changes and no workflow modifications -- just a different implementation of runSatelliteChecks.


11.2 Hyperledger Fabric Production Network
------------------------------------------------------------------------

The stub mode bridge allows the application to function without a live Fabric network. Standing up a production Fabric network requires: defining the channel configuration, deploying the Go chaincode, configuring the GoldBodMSP membership provider, and setting up peer endorsement policies. The chaincode is written and tested -- the deployment is infrastructure work.


11.3 PDF Certificate Generation
------------------------------------------------------------------------

CSDDD certificates currently exist as database records with verification URLs. Generating actual PDF certificates with embedded QR codes, audit trail hashes, and official formatting is planned as an Edge Function (generate-csddd-cert). The data model (csddd_certificates table with certificate_url and qr_code_url fields) is ready.


11.4 Production Security Hardening
------------------------------------------------------------------------

Several areas require attention before production deployment:

- HMAC secret rotation policy (currently static per user)
- Rate limit tuning under real-world load patterns
- Audit log archival and Fabric anchoring cron job
- Content Security Policy headers for the terminal dashboard
- Penetration testing of the RLS policies
- Disaster recovery for the Supabase database
- SSL certificate pinning for the Fabric peer connection


11.5 Mobile PWA Polish
------------------------------------------------------------------------

The operator declaration form works on mobile browsers and queues offline. Full PWA behavior (home screen install, push notifications for sync results, app-like navigation) requires a manifest.json refinement and expanded Service Worker caching of the operator route shell.


11.6 Analytics and Reporting
------------------------------------------------------------------------

The data model supports rich analytics: royalty calculations from declared weights and gold prices, traceability scores per operator, regional production heatmaps, average time from declaration to certification, and CSDDD compliance percentages. The terminal dashboard has the visual framework for these metrics -- the data aggregation queries need to be wired in.


========================================================================
END OF DOCUMENT
========================================================================

THE GOLDCHAIN -- Technical Architecture Document v1.0
LNK Engineering Ltd -- March 2026
Ghana Gold Board Act 2025 (Act 1140) | EU CSDDD Directive 2024/1760
