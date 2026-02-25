-- Seed data for Offline Ticket Demo

INSERT INTO app_user (id, name)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Alex'),
  ('22222222-2222-2222-2222-222222222222', 'Sam'),
  ('33333333-3333-3333-3333-333333333333', 'Riley')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO ticket (id, title, description, status, deleted_at, created_at, updated_at, version)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Replace rooftop condenser belt',
    'Old belt is cracking and causing vibration noise.',
    'pending',
    NULL,
    now() - interval '3 days',
    now() - interval '2 days',
    2
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Repair loading dock roller door',
    'Door jams near 70% open. Inspect motor and limit switch.',
    'in_progress',
    NULL,
    now() - interval '2 days',
    now() - interval '10 hours',
    5
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Quarterly generator functional test',
    'Run full load simulation and record output for compliance.',
    'done',
    NULL,
    now() - interval '6 days',
    now() - interval '1 day',
    7
  )
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  deleted_at = EXCLUDED.deleted_at,
  updated_at = EXCLUDED.updated_at,
  version = EXCLUDED.version;

INSERT INTO ticket_assignment (id, ticket_id, user_id, deleted_at, created_at)
VALUES
  ('a1a1a1a1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', NULL, now() - interval '3 days'),
  ('a1a1a1a1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '22222222-2222-2222-2222-222222222222', NULL, now() - interval '2 days'),
  ('a1a1a1a1-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '33333333-3333-3333-3333-333333333333', NULL, now() - interval '1 day')
ON CONFLICT (ticket_id, user_id) DO UPDATE
SET deleted_at = EXCLUDED.deleted_at;

INSERT INTO ticket_comment (id, ticket_id, body, created_by, deleted_at, created_at)
VALUES
  ('c1c1c1c1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Need to bring spare tensioner as well.', '22222222-2222-2222-2222-222222222222', NULL, now() - interval '2 days'),
  ('c1c1c1c1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Customer asked for completion before Friday.', '11111111-1111-1111-1111-111111111111', NULL, now() - interval '8 hours')
ON CONFLICT (id) DO UPDATE
SET
  body = EXCLUDED.body,
  deleted_at = EXCLUDED.deleted_at;

INSERT INTO ticket_attachment_url (id, ticket_id, url, url_hash, created_by, deleted_at, created_at)
VALUES
  ('d1d1d1d1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'https://example.com/manuals/condenser-belt-v2.pdf', md5('https://example.com/manuals/condenser-belt-v2.pdf'), '11111111-1111-1111-1111-111111111111', NULL, now() - interval '2 days'),
  ('d1d1d1d1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'https://example.com/photos/roller-door-issue.jpg', md5('https://example.com/photos/roller-door-issue.jpg'), '33333333-3333-3333-3333-333333333333', NULL, now() - interval '12 hours')
ON CONFLICT (ticket_id, url_hash) DO UPDATE
SET deleted_at = EXCLUDED.deleted_at;

INSERT INTO ticket_link (id, ticket_id, url, created_by, deleted_at, created_at)
VALUES
  ('e1e1e1e1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'https://kb.example.com/hvac/belt-alignment', '11111111-1111-1111-1111-111111111111', NULL, now() - interval '2 days'),
  ('e1e1e1e1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'https://kb.example.com/generator/quarterly-checklist', '22222222-2222-2222-2222-222222222222', NULL, now() - interval '1 day')
ON CONFLICT (id) DO UPDATE
SET
  url = EXCLUDED.url,
  deleted_at = EXCLUDED.deleted_at;

INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by, created_at)
VALUES
  ('f1f1f1f1-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'ticket_created', NULL, '{"source":"seed"}'::jsonb, '11111111-1111-1111-1111-111111111111', now() - interval '3 days'),
  ('f1f1f1f1-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'status_updated', 'status', '{"from":"pending","to":"in_progress"}'::jsonb, '33333333-3333-3333-3333-333333333333', now() - interval '10 hours')
ON CONFLICT (id) DO UPDATE
SET
  action = EXCLUDED.action,
  field_name = EXCLUDED.field_name,
  details = EXCLUDED.details;
