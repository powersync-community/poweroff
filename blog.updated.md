# Offline-First Apps with TanStack DB and PowerSync

Offline-first apps are web/native applications that keep working when the network is flaky or completely unavailable. The core promise is simple: users can always **read** their data instantly and consistently, and their **writes** are queued durably and sync when connectivity returns.

In practice, most of the complexity isn’t “offline storage” — it’s **conflicts**: deciding what should happen when multiple people (or devices) change the same data concurrently.

This post shows what building offline-first looks like with **PowerSync** and **TanStack DB**, and how to design conflict behavior that’s predictable for both users and operators.

## The Hassle of Offline

Building applications that can work offline is hard for a few reasons:

1. Traditional approaches (REST, GraphQL, etc.) only provide a way to access data over the network.
2. Web storage APIs are very low-level and difficult to use for non-trivial tasks.
3. Keeping a consistent local cache in sync with the server is a distributed systems problem.
4. Client state logic starts duplicating backend logic and gets complicated and inefficient.
5. Changes made offline can result in conflicts with server data, requiring resolution.

Sync engines solve (1)–(4) relatively well by providing:

1. Data access against a local database (often in-memory + persisted).
2. Automatic durable storage (filesystem / IndexedDB / SQLite).
3. Consistent bidirectional synchronization (server → client streaming, client → server queued writes).
4. Reactive queries for expressive state management (SQL or similar, type-safe builders).

The part that still requires product + engineering decisions is (5): **what to do when two valid writes disagree**.

## Theoretical vs Practical (What “Conflict” Really Means)

When two nodes are disconnected, you can’t assume there’s a single “true” timeline of intent. Clocks drift, messages arrive late, and “who wrote last” is often the wrong question.

That doesn’t mean offline writes are impossible — it means you must choose and implement **semantics**:

- Which fields are safe to edit offline?
- Which operations are allowed at all?
- When do we merge automatically vs ask a human?
- How do we make outcomes observable and auditable?

### A Concrete Conflict Scenario

Imagine a work order’s phone number starts as `A`.

- Tech goes offline and changes it to `C`.
- Manager (online) changes it to `B`.
- Tech reconnects later and uploads their queued write.

If the backend blindly applies queued writes “as they arrive”, the final value might become `C`, silently losing the manager’s newer update.

So the real question becomes: *what outcome does the business want here?* That answer varies by field and workflow.

![Arrival-order wins: offline write overwrites newer server write](./blog-images/LWW.png)

## The Stack: TanStack DB + PowerSync (Who Does What)

In this demo app (an offline work order board), the responsibilities are split cleanly:

- **PowerSync**
  - Owns the local database schema and storage (SQLite in the browser / device).
  - Replicates server → client so reads work offline.
  - Maintains a durable CRUD queue for client → server writes.
  - Calls your `uploadData` hook to push queued operations to your backend.
- **TanStack DB**
  - Provides *reactive collections* over the local PowerSync-backed tables.
  - Powers live queries in the UI (SolidJS) without re-implementing caching logic.

Here’s the architecture at a glance:

```mermaid
flowchart LR
  UI["SolidJS UI"] --> TDB["TanStack DB\n(live queries)"]
  TDB --> PSDB["PowerSync local DB\n(SQLite)"]
  PSDB <--> PSSVC["PowerSync Service\n(sync/replication)"]
  PSSVC <--> API["Your backend API\n(process queued writes)"]
  API --> DB["Postgres (source of truth)"]
```

### What the “wiring” looks like (real demo code)

PowerSync defines the local schema and the connector that uploads queued operations:

```ts
// src/lib/powersync.client.ts (demo)
class WorkOrderConnector {
  async uploadData(database: AbstractPowerSyncDatabase) {
    while (true) {
      const tx = await database.getNextCrudTransaction();
      if (!tx) break;

      const payload = tx.crud.map((op) => ({
        op: op.op,
        table: op.table,
        id: op.id,
        opData: op.opData ?? {},
      }));

      const response = await uploadToServer(payload);
      if (!response.success) throw new Error(response.error ?? "write_batch_failed");
      await tx.complete();
    }
  }
}
```

TanStack DB wraps the PowerSync tables as reactive collections for the UI:

```ts
// src/lib/tanstack-db.ts (demo)
export const workOrdersCollection = createCollection(
  powerSyncCollectionOptions({
    id: "work-orders",
    database: powerSyncDb,
    table: workOrderSchema.props.work_order,
    schema: workOrderZodSchema,
  }),
);
```

## Demo: A Work Order Board with Multiple Conflict Strategies

The demo intentionally uses **different strategies per data type**, because “one strategy for everything” is where offline UX tends to break down.

> (Screenshot) Work order list + detail editor

### A decision matrix (rule of thumb)

| Data / operation | Typical requirement | Recommended strategy | Demo outcome |
| --- | --- | --- | --- |
| `title`, `priority` | Fast edits, low risk | Last-write-wins | `applied` |
| `note` / collaborative text | Preserve both users’ intent | CRDT/OT (or merge) | `merged` |
| Inventory-like counters | Never go below zero | Domain rules (reject invalid ops) | `applied` / `rejected` |
| Status transitions / delete | Enforce workflow/permissions | Restrict + validate server-side | `rejected` (when invalid) |
| Sensitive fields (phone) | Must not silently lose updates | Manual review + resolution UI | `needs_review` |

## The Default Offline Write Path (and Why It’s Not Enough)

At the simplest level, offline writes flow like this:

1. Client makes changes while offline → PowerSync queues CRUD ops durably.
2. Client reconnects → PowerSync calls `uploadData`.
3. Backend processes operations in order and returns results.

That “process in order received” approach is a sane baseline, but it encodes a policy: **arrival order is treated as truth**. For many fields it’s fine — for others it’s wrong.

Two implementation details in the demo are worth calling out:

### 1) Idempotency / deduping

Offline clients retry. Tabs reload. Connections flap. You want “at least once” delivery to be safe.

The demo computes an `opKey` hash per operation and stores it in a `sync_operation` table so replays return the original result instead of applying twice:

```ts
// src/slices/sync-engine/reaction.process-write-batch.server.ts (demo)
function toOpKey(op, session) {
  const payload = JSON.stringify({
    op: op.op,
    table: op.table,
    id: op.id,
    opData: op.opData ?? {},
    userId: session.userId,
    role: session.role,
  });
  return createHash("sha1").update(payload).digest("hex");
}
```

### 2) Observability

Every operation returns a result code (e.g. `applied`, `merged`, `rejected`, `needs_review`) so the UI can show an activity timeline instead of leaving users guessing.

> (Screenshot) Sync activity timeline + conflict inbox

## Designing for Conflicts (Strategies That Scale)

### 1) Disable destructive actions (selectively)

The easiest way to avoid bad conflicts is to not allow the riskiest operations offline (or at all for some roles).

In the demo, delete and certain status transitions are restricted server-side:

![Restricting offline writes avoids certain conflicts](./blog-images/Restrict.png)

```ts
// src/slices/work-order/mutation.server.ts (demo)
if (op.op === UpdateType.DELETE && session.role !== "manager") {
  return { result: "rejected", reasonCode: "restricted_delete", ... };
}
```

This trades off capability for simplicity, but keeps the app usable offline for “safe” work.

### 2) Audit / activity log

Sometimes last-write-wins is acceptable *if* the history is visible and you can explain what happened.

![Last-write-wins with an audit trail](./blog-images/Audit-Log.png)

Even a lightweight “operation results” log (like the demo’s `sync_operation` + UI timeline) dramatically reduces support/debug time when something surprises a user.

### 3) Domain-specific resolution

Some conflicts aren’t “two edits” — they’re business invariants.

In the demo, `part_usage_event` is modeled as an **append-only domain event** with an inventory check. If applying an offline event would make inventory negative, it is rejected:

![Domain-specific resolution keeps invariants true](./blog-images/Domain-Specific.png)

```ts
// src/slices/part-usage-event/mutation.server.ts (demo)
if (onHand + qtyDelta < 0) {
  return { result: "rejected", reasonCode: "inventory_underflow", ... };
}
```

This is predictable, testable, and matches what users often expect (“you can’t use parts you don’t have”).

### 4) Manual resolution (conflict inbox)

For sensitive fields, the safest move is to record a conflict and let a human decide.

In the demo, phone updates can create a `conflict_record` instead of silently overwriting. A manager can then pick “keep local”, “keep server”, or enter a custom value:

![Manual resolution: ask a human which value should win](./blog-images/Manual.png)

```ts
// src/slices/conflict-record/mutation.server.ts (demo)
if (strategy === "local") value = conflict.local_value?.value ?? null;
if (strategy === "server") value = conflict.server_value?.value ?? null;
if (strategy === "custom") value = customValue ?? null;
```

### 5) CRDT / OT for collaborative text

For collaborative documents, “pick a winner” is usually the wrong UX. CRDTs and OT are designed to merge concurrent edits.

![CRDT-style merge produces a combined state](./blog-images/CRDT.png)

The demo uses a deliberately simple merge for `work_order_note.crdt_payload` (line-based uniqueness) to illustrate the shape of the solution. In production, you’d typically reach for something like Yjs or Automerge depending on your requirements and architecture.

## Optionality: Start Simple, Upgrade by Data Type

Very few apps need every strategy everywhere. A pragmatic path that works well:

1. Start with last-write-wins for low-risk fields.
2. Add domain checks for invariant-heavy workflows.
3. Add manual review where silent overwrites are unacceptable.
4. Use CRDT/OT only where users genuinely expect multi-writer collaboration.

The key is to treat conflict behavior as **part of your product design**, not a backend implementation detail.

## Try the Demo (CTA)

If you want to see these strategies side-by-side, run the demo in this repo:

```bash
bun install
cp .env.example .env
bun run dev:stack:up
bun dev
```

Then:

1. Switch to Tech, go offline, make edits, add a note, add part usage events.
2. Reconnect and observe which ops are `applied`, `merged`, `rejected`, or `needs_review`.
3. Switch to Manager and resolve phone conflicts in the Conflict Inbox.

## References

- [PowerSync docs: Handling update conflicts](https://docs.powersync.com/handling-writes/handling-update-conflicts)
- [PowerSync docs: Custom conflict resolution](https://docs.powersync.com/handling-writes/custom-conflict-resolution)
- [PowerSync blog: Offline-first apps made simple](https://www.powersync.com/blog/offline-first-apps-made-simple-supabase-powersync)
- [PowerSync blog: Local-first key concepts](https://www.powersync.com/blog/local-first-key-concepts-offline-first-vs-local-first)
- [Supabase blog: Postgres + CRDTs (offline philosophy)](https://supabase.com/blog/postgres-crdt#offline-philosophy)
