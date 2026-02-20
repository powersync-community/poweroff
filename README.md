# Offline Work Order Board Demo

Experimental SolidStart demo for offline conflict resolution with:

- SolidJS + SolidStart
- PowerSync (local-first queue + sync)
- TanStack DB (reactive collections)
- Self-hosted local stack via Docker (PowerSync + dual Postgres)

The app is intentionally demo-grade and optimized to show conflict strategy behavior, not production hardening.

## Implemented Conflict Strategies

- `work_order.title` and `work_order.priority`: Last-write-wins (`applied`)
- `work_order_note.crdt_payload`: simple CRDT-style line merge (`merged`)
- `part_usage_event` inserts: domain event handling with inventory checks (`applied` / `rejected`)
- `work_order.status` and delete actions: role-restricted (`rejected` for tech)
- `work_order.site_contact_phone`: manual conflict records (`needs_review`)

## Demo Roles

- `tech`: can edit safe fields and create note/part events
- `manager`: can resolve conflicts and perform privileged transitions/actions

Role switch is in the top status bar (mock auth via cookie).

## Local Bootstrap

1. Install dependencies

```bash
bun install
```

2. Create your env file

```bash
cp .env.example .env
```

3. Start local PowerSync + Postgres stack

```bash
bun run dev:stack:up
```

4. Verify PowerSync is up

```bash
curl -f http://localhost:8080/probes/liveness
```

5. Start the app

```bash
bun dev
```

6. Open the app and run the demo scenario

## UI Overview

- Left: work order list
- Right: work order detail editor
- Top bar: online/offline toggle, role/user, pending queue count, open conflicts
- Bottom panels: sync activity timeline and conflict inbox

## Scenario Walkthrough (A/B/C)

1. Switch to Tech view and go offline.
2. Edit title/priority/phone, edit note, add part event.
3. Reconnect; queued writes upload in order.
4. Observe sync activity outcomes: `applied`, `merged`, `rejected`, `needs_review`.
5. Switch to Manager view and resolve open phone conflicts in Conflict Inbox.

## Troubleshooting

- Token / audience mismatch:
  - Ensure `.env` and `docker-compose.yml` values match for:
    - `POWERSYNC_JWT_KID`
    - `POWERSYNC_JWT_SECRET_B64URL`
    - `POWERSYNC_JWT_AUDIENCE`
  - If mismatched, restart stack: `bun run dev:stack:reset && bun run dev:stack:up`
- Replication/publication issues:
  - Check source DB publication exists:
    - `docker exec -it powerchat-postgres-source psql -U postgres -d powerchat -c "SELECT pubname FROM pg_publication;"`
  - Confirm role exists:
    - `docker exec -it powerchat-postgres-source psql -U postgres -d powerchat -c "\du"`
- Stale local data / bucket state:
  - Reset containers and volumes: `bun run dev:stack:reset`
  - Delete local sqlite cache if needed: `.powersync/powerchat-server.db`

## Notes

- Source DB schema/seed live in `db/` and are mirrored into Docker init scripts under `docker/postgres-source/init/`.
- Backend write handling now lives in vertical slices under `src/slices/` (`mutation`, `query`, `reaction` modules).
- Public server functions remain in `src/server/powersync.ts`.
