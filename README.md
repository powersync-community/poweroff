# Offline Ticket Demo (PowerSync + TanStack DB)

Experimental SolidStart demo for offline-first ticket workflows.

## Stack

- SolidJS + SolidStart
- PowerSync (local-first queue + sync)
- TanStack DB (reactive collections)
- Local Docker stack (PowerSync + source/storage Postgres)

## Demo Strategies

Routes are split by strategy, matching the blog narrative:

- `/demo/lww` - last-write-wins defaults
- `/demo/restricted` - disable destructive edits while offline
- `/demo/audit-log` - append ticket activity rows for accepted writes
- `/demo/domain-resolution` - domain rule keeps `done` from stale reopen attempts
- `/demo/manual-resolution` - manual conflict inbox (`local`/`server`/`custom`)
- `/demo/crdt` - collaborative description via Yjs delta rows

## Data Model

Core tables:

- `ticket`
- `ticket_assignment`
- `ticket_comment`
- `ticket_attachment_url`
- `ticket_link`
- `ticket_description_update`
- `ticket_conflict`
- `ticket_activity`
- `sync_operation`

## Local Bootstrap

1. Install dependencies

```bash
bun install
```

2. Create env file

```bash
cp .env.example .env
```

3. Start local PowerSync + Postgres stack

```bash
bun run dev:stack:up
```

4. Start app (logs are always piped to `logs/dev.log`)

```bash
bun dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Reset After Schema Changes

This demo assumes breaking schema changes are acceptable.

```bash
bun run dev:stack:reset
bun run dev:stack:up
```

## Tests

```bash
bun run test --run
```

E2E helper:

```bash
bun run test:e2e:headless
```
