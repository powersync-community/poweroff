-- Offline Ticket Demo Schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'done')),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ticket_assignment (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, user_id)
);

CREATE TABLE IF NOT EXISTS ticket_comment (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES app_user(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_attachment_url (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES app_user(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ticket_id, url_hash)
);

CREATE TABLE IF NOT EXISTS ticket_link (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES app_user(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_description_update (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  update_b64 TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_conflict (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  local_value JSONB NOT NULL,
  server_value JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolved_value JSONB,
  resolved_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ticket_activity (
  id UUID PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  field_name TEXT,
  details JSONB,
  created_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_operation (
  op_key TEXT PRIMARY KEY,
  result_code TEXT NOT NULL,
  reason_code TEXT,
  conflict_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_status ON ticket (status);
CREATE INDEX IF NOT EXISTS idx_ticket_assignment_ticket ON ticket_assignment (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_comment_ticket ON ticket_comment (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_attachment_ticket ON ticket_attachment_url (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_link_ticket ON ticket_link (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_description_update_ticket ON ticket_description_update (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_activity_ticket ON ticket_activity (ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_conflict_status ON ticket_conflict (status, created_at);

CREATE OR REPLACE FUNCTION bump_ticket_version()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' THEN
    NEW.version = COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ticket_bump_version ON ticket;
CREATE TRIGGER trg_ticket_bump_version
BEFORE UPDATE ON ticket
FOR EACH ROW
EXECUTE FUNCTION bump_ticket_version();
