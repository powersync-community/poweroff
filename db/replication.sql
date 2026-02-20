-- PowerSync replication setup for Offline Work Order Board demo.
-- Run this after enabling logical replication.

CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';

GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

CREATE PUBLICATION powersync FOR ALL TABLES;

-- Sync rule intent (configure in PowerSync service):
-- request.jwt() includes user_id + role
--
-- bucket tech_work_orders:
--   SELECT * FROM work_order WHERE assignee_id = request.user_id()::uuid;
--
-- bucket manager_work_orders:
--   SELECT * FROM work_order WHERE request.jwt() ->> 'role' = 'manager';
--
-- related tables bucketed by work_order_id:
--   work_order_note, part_usage_event, conflict_record
--
-- managers get open conflicts globally for demo simplicity.
