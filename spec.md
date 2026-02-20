# Offline Work Order Board Demo Spec

## 1. Overview

### 1.1 Purpose

Build a minimal but comprehensive demo app that showcases multiple offline conflict-resolution strategies in one coherent workflow using:

- **SolidJS** for reactive UI and state management
- **PowerSync** for local-first sync and offline write queue
- **TanStack DB** for reactive local collections and optimistic UX

### 1.2 Demo Goal

Demonstrate that different data types require different conflict strategies, including:

- Last-write-wins (LWW)
- CRDT-based merge
- Domain-specific resolution
- Write restrictions (prevent destructive actions)
- Manual conflict resolution UI

### 1.3 Audience

- Engineers evaluating offline-first architecture
- Product/technical stakeholders evaluating tradeoffs
- Developer advocates creating walkthrough demos

---

## 2. Product Scope

### 2.1 In Scope

- Tech user can edit work orders offline
- Manager can resolve specific conflicts manually
- Offline queue sync on reconnect
- Conflict outcomes visible in UI and logs
- Role-based restricted writes
- Attachment support optional (phase 2)

### 2.2 Out of Scope

- Production-grade auth/security hardening
- Enterprise-scale observability
- Multi-tenant billing
- Full CRDT editor feature parity with Google Docs

---

## 3. Personas

### 3.1 Tech User

- Works in low/no connectivity
- Edits assigned work orders
- Adds notes and part usage
- Attempts state transitions

### 3.2 Manager User

- Oversees multiple work orders
- Resolves data conflicts requiring judgment
- Has elevated permissions for destructive/state-sensitive actions

---

## 4. Key Demo Scenarios

### Scenario A: Offline Edits + Online Concurrent Changes

1. Tech goes offline
2. Tech updates title/priority/phone, adds note and parts
3. Manager (online) updates same order and closes it
4. Tech reconnects and syncs
5. System applies mixed conflict strategies

Expected outcomes:

- Title/priority: LWW
- Notes: merged via CRDT
- Part events: accepted as domain events
- Invalid status transition: rejected by restriction logic
- Phone collision: manual conflict created

### Scenario B: Restricted Destructive Write

1. Tech attempts to delete or reopen closed order
2. Backend rejects due to role/state policy
3. Client shows rejection state and guidance

### Scenario C: Manual Conflict Resolution

1. Manager opens conflict inbox
2. Compares local vs server values
3. Chooses local/server/custom value
4. Resolution syncs to all clients

---

## 5. Functional Requirements

### 5.1 Work Order List + Detail

- Show list of work orders visible to current user
- Show detail fields and conflict strategy label per field
- Show online/offline indicator
- Show pending queue count

### 5.2 Offline Editing

- Allow edits while offline for permitted fields
- Persist edits locally immediately
- Queue write operations for upload

### 5.3 Sync Behavior

- On reconnect, upload queued operations in order
- Display per-operation status: applied, merged, rejected, needs-review
- Keep UX understandable for rejected items

### 5.4 Conflict Handling Modes

- **LWW fields**: `title`, `priority`
- **CRDT field**: `work_order_note.crdt_payload`
- **Domain events**: `part_usage_event` entries
- **Restricted writes**: close/reopen/delete rules by role/state
- **Manual conflict fields**: `site_contact_phone`

### 5.5 Conflict Inbox

- Manager-only screen listing open conflicts
- View local/server values
- Resolve with:
  - Keep local
  - Keep server
  - Custom value
- Mark conflict resolved and apply chosen value

### 5.6 Permissions

- Tech role:
  - Can edit safe fields
  - Cannot delete
  - Cannot reopen closed order
- Manager role:
  - Can resolve conflicts
  - Can perform privileged transitions/actions

---

## 6. Non-Functional Requirements

- App remains usable offline
- Local writes feel instant
- Sync retries are resilient
- Idempotent write handling on backend
- Clear auditability of conflict decisions
- Minimal setup for local demo environment

---

## 7. Data Model

## 7.1 SQL Schema (Source DB)

```sql
create table app_user (
  id uuid primary key,
  name text not null,
  role text not null check (role in ('tech', 'manager'))
);

create table work_order (
  id uuid primary key,
  title text not null,
  priority text not null check (priority in ('low', 'medium', 'high')),
  status text not null check (status in ('open', 'in_progress', 'closed')),
  assignee_id uuid references app_user(id),
  site_contact_phone text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 0
);

create table work_order_note (
  work_order_id uuid primary key references work_order(id) on delete cascade,
  crdt_payload bytea not null,
  updated_by uuid not null references app_user(id),
  updated_at timestamptz not null default now()
);

create table part_usage_event (
  id uuid primary key,
  work_order_id uuid not null references work_order(id) on delete cascade,
  part_sku text not null,
  qty_delta integer not null,
  created_by uuid not null references app_user(id),
  created_at timestamptz not null default now()
);

create table part_inventory (
  part_sku text primary key,
  on_hand integer not null check (on_hand >= 0)
);

create table conflict_record (
  id uuid primary key,
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,
  local_value jsonb not null,
  server_value jsonb not null,
  status text not null check (status in ('open', 'resolved', 'dismissed')),
  resolved_value jsonb,
  resolved_by uuid references app_user(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
```

---

## 8. Conflict Policy Matrix

| Data / Action                             | Strategy                    | Owner                         |
| ----------------------------------------- | --------------------------- | ----------------------------- |
| `work_order.title`                        | LWW                         | Backend                       |
| `work_order.priority`                     | LWW                         | Backend                       |
| `work_order_note.crdt_payload`            | CRDT merge                  | Backend + client editor logic |
| `part_usage_event` insert                 | Domain event reconciliation | Backend                       |
| `work_order.status` transitions           | Domain + restrictions       | Backend                       |
| `work_order.deleted_at` / delete          | Restricted by role          | Backend                       |
| `work_order.site_contact_phone` collision | Manual conflict             | Backend + manager UI          |

---

## 9. Backend Write Handling Spec

### 9.1 Principles

- Operations must be idempotent
- Validate role and current entity state
- Return explicit result codes: `applied`, `merged`, `rejected`, `needs_review`

### 9.2 Rules

1. **LWW fields**
   - Apply incoming value; latest accepted write wins
2. **CRDT payload**
   - Merge server and incoming payload; save merged document
3. **Part usage events**
   - Insert event (dedupe by operation/event id)
   - Recompute/check inventory constraints
4. **Restricted actions**
   - Reject delete/reopen if role/state disallows
5. **Manual conflict fields**
   - On mismatch policy trigger, create `conflict_record(status='open')`
   - Do not silently overwrite protected field

---

## 10. Sync Rules (PowerSync)

### 10.1 Access Model

- Tech users sync only assigned work orders + related notes/events/conflicts relevant to them
- Managers sync broader dataset (team or all demo records)

### 10.2 Example Sync Rule Intent

- Parameter from JWT: `user_id`, `role`
- Buckets:
  - `tech_work_orders`: where `assignee_id = request.user_id()`
  - `manager_work_orders`: all work orders if role is manager
  - Related data bucketed by `work_order_id`
  - Conflict records bucketed by entity ownership/manager scope

---

## 11. UI/UX Requirements

### 11.1 Main Layout

- Left: work order list
- Right: work order detail
- Top status bar:
  - Online/offline
  - Current role/user
  - Pending queue count
  - Network toggle (demo control)

### 11.2 Field Labels

Show strategy chips near fields:

- `[LWW]`, `[CRDT]`, `[DOMAIN]`, `[MANUAL]`, `[RESTRICTED]`

### 11.3 Sync Activity Panel

- Ordered operation timeline
- Status icon and message per operation
- Link to conflict inbox when conflicts created

### 11.4 Conflict Inbox

- Table of open conflicts
- Row actions: Review / Resolve
- Modal with local vs server vs custom
- Save resolution and refresh all clients

---

## 12. API Contract (Minimal)

### 12.1 `POST /api/sync/write-batch`

- Input: ordered batch of operations from client queue
- Output:
  - per-op result (`applied|merged|rejected|needs_review`)
  - optional reason code
  - optional conflict id

### 12.2 `GET /api/conflicts?status=open`

- Manager-only
- Returns conflict records

### 12.3 `POST /api/conflicts/:id/resolve`

- Manager-only
- Body: `{ strategy: "local|server|custom", customValue? }`
- Applies resolution, marks conflict resolved

---

## 13. Observability / Demo Telemetry

Track counters:

- `sync_ops_applied_total`
- `sync_ops_rejected_total`
- `sync_ops_merged_total`
- `conflicts_created_total`
- `conflicts_resolved_total`

Log per op:

- operation id
- entity
- policy route taken
- final result

---

## 14. Test Plan

### 14.1 Unit Tests

- Policy engine for each conflict mode
- Role/state restriction rules
- Manual conflict creation logic
- Idempotency dedupe behavior

### 14.2 Integration Tests

- Offline batch upload with mixed outcomes
- CRDT merge roundtrip
- Manager conflict resolution update propagation

### 14.3 Manual Demo Validation

- Perform Scenario A/B/C end-to-end
- Verify UI labels match actual policy applied

---

## 15. Acceptance Criteria

1. Offline edits are possible and persisted locally
2. Reconnect triggers ordered sync processing
3. Demo shows all 5 conflict strategies in one flow
4. Restricted destructive writes are explicitly blocked
5. Manual conflict can be resolved by manager and synced to clients
6. Outcome is visible in both activity log and data state

---

## 16. Implementation Phases

### Phase 1 (MVP Demo)

- Schema + basic list/detail UI
- Offline queue + reconnect sync
- LWW + restrictions + manual conflict
- Conflict inbox and resolution

### Phase 2

- CRDT notes integration
- Domain event inventory checks
- Better telemetry and polish

### Phase 3

- Optional attachments
- Optional multi-device scripted demo automation

---

## 17. Demo Script (Presenter Cheat Sheet)

1. Open Tech A (offline), Manager (online)
2. Tech A edits title, priority, phone, notes, parts
3. Manager closes same work order
4. Tech A reconnects
5. Show sync panel:
   - LWW applied
   - CRDT merged
   - domain events applied
   - restricted action rejected
   - conflict created
6. Manager resolves phone conflict
7. Show both clients auto-updated

---

## 18. Risks and Mitigations

- **CRDT complexity risk**: start with a simple payload merge implementation
- **Policy confusion**: display strategy chips and sync timeline in UI
- **Queue blocking risk**: return structured rejections and handle them explicitly
- **Scope creep**: keep single entity family (`work_order*`) for first demo

---

## 19. Deliverables

- Running demo app (tech + manager role views)
- Seed data and scripted scenario
- This spec
- Short README with startup and demo steps
