# Operations Under Pressure - Newtonite Engineering Assessment

An internal web application designed to coordinate operational work items reliably under high-concurrency conditions. Built to replace fragmented chat messages, spreadsheets, and emails with deterministic workflows, resource-level authorization, and append-only audit histories.

---

## Prerequisites

- **Node.js**: v20 or later
- **Docker**: For running PostgreSQL locally
- **npm**: v10 or later

---

## Quick Start & Setup Instructions

### 1. Start the PostgreSQL Database
Launch a PostgreSQL 16 container via Docker:
```bash
docker run --name newtonite-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=newtonite_ops -p 5432:5432 -d postgres:16-alpine
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/newtonite_ops?schema=public"
```

### 3. Install Dependencies

```bash
npm install --legacy-peer-deps
```

### 4. Push Database Schema & Seed Data

Push the Prisma schema to PostgreSQL, generate client bindings, and run the database seed script:

```bash
npx prisma db push --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
npx tsx prisma/seed.ts
```

*(If `tsx` is not installed, use `npx ts-node prisma/seed.ts`).*

### 5. Run the Application

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Running Automated Tests

Run the Vitest integration suite covering optimistic concurrency control, role-based guards, and transactional audit trails:

```bash
npm run test
```

---

## Core System Architecture & Features

* **Optimistic Concurrency Control (OCC):** Prevents silent overwrites when multiple operators interact with the same record simultaneously. State transitions require an `expectedVersion`; stale updates trigger an `HTTP 409 Conflict` and re-sync the client.


* **Atomic Audit Trail:** Every status mutation, claiming action, and update writes an append-only log within the exact same database transaction (`db.$transaction`), ensuring history cannot desynchronize from actual record state.


* **Server-Enforced RBAC:** Role boundaries (`MEMBER`, `LEAD`, `ADMIN`) are enforced at the API route layer rather than relying on cosmetic UI disabling.


* **Idempotency Protection:** The creation endpoint accepts an `idempotencyKey` to prevent accidental duplicate work item submissions during network lag.


* **Bounded Queries:** Server-side search and filtering (`take: 100`) backed by composite indexes prevent memory degradation as the volume of work items scales.



---

## Known Limitations

1. **Client Invalidation (Refetch vs. Real-Time Push):**
* The UI refetches upon mutation and user action rather than maintaining persistent WebSocket or Server-Sent Events (SSE) connections.
* If User A modifies an item, User B's screen does not update in real time until an interaction occurs. However, data consistency is strictly protected: if User B attempts an action based on stale data, the backend halts execution with an `HTTP 409 Conflict` error and forces a client refresh.




2. **Demonstration Identity Switcher:**
* To make evaluating role-based permissions straightforward during review, an identity dropdown in the top navigation bar allows instant switching between users (`Alice Zhang - ADMIN`, `Bob Smith - LEAD`, `Charlie Davis - MEMBER`).


* In production, this would be replaced with a secure session provider (e.g., NextAuth/Auth.js with JWTs or HTTP-only session cookies).


3. **In-Database Idempotency Store:**
* Idempotency keys are tracked in a PostgreSQL table inside the transaction. While functionally sound and atomic, a high-throughput enterprise environment would delegate short-lived idempotency tokens to an in-memory cache (e.g., Redis) with automatic TTL eviction.