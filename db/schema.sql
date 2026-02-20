-- Offline Work Order Board Demo Schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('tech', 'manager'))
);

CREATE TABLE IF NOT EXISTS work_order (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'closed')),
  assignee_id UUID REFERENCES app_user(id),
  site_contact_phone TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS work_order_note (
  id UUID PRIMARY KEY,
  work_order_id UUID NOT NULL UNIQUE REFERENCES work_order(id) ON DELETE CASCADE,
  crdt_payload BYTEA NOT NULL,
  updated_by UUID NOT NULL REFERENCES app_user(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS part_usage_event (
  id UUID PRIMARY KEY,
  work_order_id UUID NOT NULL REFERENCES work_order(id) ON DELETE CASCADE,
  part_sku TEXT NOT NULL,
  qty_delta INTEGER NOT NULL,
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS part_inventory (
  part_sku TEXT PRIMARY KEY,
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0)
);

CREATE TABLE IF NOT EXISTS conflict_record (
  id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  field_name TEXT NOT NULL,
  local_value JSONB NOT NULL,
  server_value JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_value JSONB,
  resolved_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Stores dedupe keys for idempotent write-batch handling.
CREATE TABLE IF NOT EXISTS sync_operation (
  op_key TEXT PRIMARY KEY,
  result_code TEXT NOT NULL,
  reason_code TEXT,
  conflict_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_order_assignee ON work_order (assignee_id);
CREATE INDEX IF NOT EXISTS idx_work_order_status ON work_order (status);
CREATE INDEX IF NOT EXISTS idx_part_usage_event_work_order ON part_usage_event (work_order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conflict_record_status ON conflict_record (status, created_at);
CREATE INDEX IF NOT EXISTS idx_conflict_record_entity ON conflict_record (entity_type, entity_id);

CREATE OR REPLACE FUNCTION bump_work_order_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' THEN
    NEW.version = COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_order_bump_version ON work_order;
CREATE TRIGGER trg_work_order_bump_version
BEFORE UPDATE ON work_order
FOR EACH ROW
EXECUTE FUNCTION bump_work_order_version();
