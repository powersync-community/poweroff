-- PowerSync replication setup for Offline Ticket Demo.
-- Run this after enabling logical replication.

CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'REPLACE_WITH_SECURE_PASSWORD';

GRANT USAGE ON SCHEMA public TO powersync_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

CREATE PUBLICATION powersync FOR ALL TABLES;

-- Sync rule intent (configure in PowerSync service):
-- request.jwt() includes user_id
--
-- bucket demo_data:
--   SELECT * FROM app_user;
--   SELECT * FROM ticket;
--   SELECT * FROM ticket_assignment;
--   SELECT * FROM ticket_comment;
--   SELECT * FROM ticket_attachment_url;
--   SELECT * FROM ticket_link;
--   SELECT * FROM ticket_description_update;
--   SELECT * FROM ticket_conflict;
--   SELECT * FROM ticket_activity;
