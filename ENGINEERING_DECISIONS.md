# ENGINEERING_DECISIONS.md

## Overview
This document outlines the core architectural and product decisions made during the one-day full-stack engineering assessment for the Newtonite Operations Console. The system addresses operational fragmentation caused by reliance on chat, email, and spreadsheets by introducing deterministic workflows, strong concurrency guarantees, granular authorization, and immutable audit trails.

---

## 1. Concurrency Control: Optimistic Concurrency Control (OCC) vs. Pessimistic Locking
* **Decision:** We implemented Optimistic Concurrency Control using an integer `version` field on the `WorkItem` model. Every update query atomically validates that `current.version === expectedVersion` before committing mutations and incrementing the version counter.
* **Context & Problem:** Multiple team members frequently review or edit operational work items simultaneously. A common operational failure occurs when one operator modifies or claims an issue while another operator is looking at an outdated version.
* **Trade-offs Considered:**
  * *Pessimistic Locking (`SELECT ... FOR UPDATE`):* While pessimistic locks guarantee sequential updates, they require holding database connection locks open across the duration of user interactions or transaction windows. In a triage environment with hundreds of concurrent users, this leads to connection pool saturation, latency spikes, and deadlocks.
  * *Optimistic Locking:* We assume write conflicts are occasional rather than constant. By passing the expected version from the client, the database can reject stale updates cleanly with an `HTTP 409 Conflict`.
* **Mitigation:** When a `409 Conflict` occurs, the frontend triggers a descriptive warning toast and automatically re-fetches the current server state, protecting against silent data overwrites.

---

## 2. Collaboration & History: Synchronous In-Transaction Audit Logging
* **Decision:** Every state change, assignment reassignment, and status transition is recorded to an append-only `AuditLog` table within the exact same database transaction (`db.$transaction`) that applies the mutation.
* **Context & Problem:** In ad-hoc operations, historical context and accountability frequently vanish inside chat threads. When an item progresses or changes ownership, management and collaborators need an auditable timeline explaining who changed what, when, and why.
* **Trade-offs Considered:**
  * *Asynchronous Event Queue (BullMQ / Kafka / Redis Streams):* Emitting audit events to an asynchronous message broker decouples the logging path from the HTTP request, yielding faster perceived response times. However, this introduces the risk of dual-write discrepancies: if the queue drops a packet or crashes before processing, the work item state mutates without an audit record, or vice versa.
  * *Atomic In-Transaction Writes:* Incorporating the audit insert directly into the ACID transaction incurs a minor write latency overhead (~2–4 ms in PostgreSQL), but guarantees absolute consistency. It is architecturally impossible for a work item to transition states without an accompanying audit log entry.

---

## 3. Security & Access: Database-Enforced RBAC over Client-Side Guarding
* **Decision:** Role-based authorization rules (`MEMBER`, `LEAD`, `ADMIN`) are enforced within the backend transaction handlers rather than relying on UI control visibility.
* **Context & Problem:** The candidate brief requires a meaningful authorization model where different users have varying responsibilities across teams and not all users can execute every action.
* **Implementation & Trade-offs:**
  * Relying solely on client-side button hiding or route shielding is fragile and easily bypassed using direct API requests or outdated browser states.
  * We introduced resource-level guards directly in the mutation pipeline: for example, standard `MEMBER` users are prohibited from marking `URGENT` production work items as `RESOLVED`, returning an explicit `HTTP 403 Forbidden`.
  * *Trade-off:* Every mutation endpoint requires contextual actor resolution (`actorId`), slightly increasing transaction overhead, but ensuring the system remains secure regardless of client behavior.

---

## 4. Concurrency & Integrity: Idempotency Key Handling
* **Decision:** The creation endpoint accepts an optional `idempotencyKey` stored inside an `IdempotencyRecord` table within the creation transaction.
* **Context & Problem:** In operational pressure situations (such as site outages or high-value payment reviews), users frequently double-click submit buttons or retry requests when network latency causes perceived delays.
* **Trade-offs Considered:**
  * *Pure Frontend Throttling (e.g., button disabling):* Does not protect against dropped TCP connections, browser reloads, or automated retries.
  * *Transactional Idempotency Tracking:* The server checks for existing keys before creating duplicate records. If a matching key is found, it returns the previously generated work item payload with `HTTP 200 OK` rather than duplicating the record in the database.

---

## 5. Performance & Scale: Server-Side Query Bounding vs. Client Ingestion
* **Decision:** Work item browsing, search, and team/status filtering are executed as indexed PostgreSQL queries with hard limits (`take: 100`) rather than shipping complete data tables to the client.
* **Context & Problem:** The application is scoped for tens of thousands of work items and growing audit trails. Loading entire datasets into client-side JavaScript memory causes severe UI lag and memory pressure.
* **Implementation:**
  * Added compound database indexes (`@@index([status, priority])` and `@@index([teamId])`) to satisfy operational filtering efficiently.
  * Filter criteria (`search`, `teamId`, `status`) are evaluated directly in SQL via Prisma. Detailed audit histories are loaded on-demand per work item inside the slide-over sheet rather than joined eagerly across the entire dashboard table.

---

## Intentional Deferrals & Future Roadmap
Given the one-day constraint of the challenge, we deliberately deferred the following items to preserve architectural correctness on core transaction flows:

1. **Real-Time Push Updates (WebSockets / SSE):**
   * *Current State:* The client relies on query invalidation and refetching on mutation. Stale data is safely caught via OCC (`409 Conflict`).
   * *Next Step:* Implement Server-Sent Events (SSE) to push invalidate events to active clients when another operator modifies an assigned item.
2. **Transactional Outbox for Secondary Side-Effects:**
   * *Current State:* Asynchronous enrichment, notifications, and webhook alerts are not executed inline to prevent request blocking.
   * *Next Step:* Introduce an outbox pattern table written during the primary transaction, polled by background workers (e.g., BullMQ) with retry limits and dead-letter queues.
3. **Custom Per-Team Workflow State Machines:**
   * *Current State:* A unified status progression enum (`OPEN`, `IN_PROGRESS`, `PENDING_APPROVAL`, `RESOLVED`, `CLOSED`).
   * *Next Step:* Allow individual teams (e.g., Compliance vs. Platform Engineering) to configure multi-stage approval rules and custom step validations.