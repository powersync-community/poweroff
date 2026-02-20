-- Seed data for Offline Work Order Board demo

INSERT INTO app_user (id, name, role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Tech A', 'tech'),
  ('22222222-2222-2222-2222-222222222222', 'Manager M', 'manager')
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  role = EXCLUDED.role;

INSERT INTO part_inventory (part_sku, on_hand)
VALUES
  ('MOTOR-1HP', 8),
  ('FILTER-24', 20),
  ('VALVE-RED', 12)
ON CONFLICT (part_sku) DO UPDATE
SET on_hand = EXCLUDED.on_hand;

INSERT INTO work_order (
  id,
  title,
  priority,
  status,
  assignee_id,
  site_contact_phone,
  deleted_at,
  created_at,
  updated_at,
  version
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'Inspect rooftop HVAC unit',
    'medium',
    'open',
    '11111111-1111-1111-1111-111111111111',
    '555-0100',
    NULL,
    now() - interval '2 days',
    now() - interval '2 days',
    1
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'Replace water pump gasket',
    'high',
    'in_progress',
    '11111111-1111-1111-1111-111111111111',
    '555-0133',
    NULL,
    now() - interval '1 day',
    now() - interval '1 day',
    3
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    'Close out generator test',
    'low',
    'closed',
    '11111111-1111-1111-1111-111111111111',
    '555-0199',
    NULL,
    now() - interval '5 days',
    now() - interval '4 days',
    5
  )
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  assignee_id = EXCLUDED.assignee_id,
  site_contact_phone = EXCLUDED.site_contact_phone,
  deleted_at = EXCLUDED.deleted_at,
  updated_at = EXCLUDED.updated_at,
  version = EXCLUDED.version;

INSERT INTO work_order_note (id, work_order_id, crdt_payload, updated_by, updated_at)
VALUES
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    convert_to('Initial checklist:\n- Confirm vibration\n- Capture amperage', 'UTF8'),
    '22222222-2222-2222-2222-222222222222',
    now() - interval '2 days'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    convert_to('Gasket replacement in progress.', 'UTF8'),
    '11111111-1111-1111-1111-111111111111',
    now() - interval '12 hours'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    convert_to('Final test completed and signed.', 'UTF8'),
    '22222222-2222-2222-2222-222222222222',
    now() - interval '4 days'
  )
ON CONFLICT (id) DO UPDATE
SET
  work_order_id = EXCLUDED.work_order_id,
  crdt_payload = EXCLUDED.crdt_payload,
  updated_by = EXCLUDED.updated_by,
  updated_at = EXCLUDED.updated_at;
