import { createCollection } from "@tanstack/solid-db";
import { powerSyncCollectionOptions } from "@tanstack/powersync-db-collection";
import { z } from "zod";
import {
  getPowerSync,
  powerSyncDb,
  ticketSchema,
} from "~/lib/powersync.client";

const textColumn = z.union([z.string(), z.null(), z.undefined()]);
const intColumn = z.union([z.number(), z.null(), z.undefined()]);

const appUserSchema = z.object({
  id: z.string(),
  name: textColumn,
});

const ticketRowSchema = z.object({
  id: z.string(),
  title: textColumn,
  description: textColumn,
  status: textColumn,
  deleted_at: textColumn,
  created_at: textColumn,
  updated_at: textColumn,
  version: intColumn,
});

const ticketAssignmentSchema = z.object({
  id: z.string(),
  ticket_id: textColumn,
  user_id: textColumn,
  deleted_at: textColumn,
  created_at: textColumn,
});

const ticketCommentSchema = z.object({
  id: z.string(),
  ticket_id: textColumn,
  body: textColumn,
  created_by: textColumn,
  deleted_at: textColumn,
  created_at: textColumn,
});

const ticketAttachmentSchema = z.object({
  id: z.string(),
  ticket_id: textColumn,
  url: textColumn,
  url_hash: textColumn,
  created_by: textColumn,
  deleted_at: textColumn,
  created_at: textColumn,
});

const ticketLinkSchema = z.object({
  id: z.string(),
  ticket_id: textColumn,
  url: textColumn,
  created_by: textColumn,
  deleted_at: textColumn,
  created_at: textColumn,
});

const ticketDescriptionUpdateSchema = z.object({
  id: z.string(),
  ticket_id: textColumn,
  update_b64: textColumn,
  created_by: textColumn,
  created_at: textColumn,
});

const ticketConflictSchema = z.object({
  id: z.string(),
  ticket_id: textColumn,
  field_name: textColumn,
  local_value: textColumn,
  server_value: textColumn,
  status: textColumn,
  resolved_value: textColumn,
  resolved_by: textColumn,
  created_at: textColumn,
  resolved_at: textColumn,
});

const ticketActivitySchema = z.object({
  id: z.string(),
  ticket_id: textColumn,
  action: textColumn,
  field_name: textColumn,
  details: textColumn,
  created_by: textColumn,
  created_at: textColumn,
});

export const appUsersCollection = createCollection(
  powerSyncCollectionOptions({
    id: "app-users",
    database: powerSyncDb,
    table: ticketSchema.props.app_user,
    schema: appUserSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketsCollection = createCollection(
  powerSyncCollectionOptions({
    id: "tickets",
    database: powerSyncDb,
    table: ticketSchema.props.ticket,
    schema: ticketRowSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketAssignmentsCollection = createCollection(
  powerSyncCollectionOptions({
    id: "ticket-assignments",
    database: powerSyncDb,
    table: ticketSchema.props.ticket_assignment,
    schema: ticketAssignmentSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketCommentsCollection = createCollection(
  powerSyncCollectionOptions({
    id: "ticket-comments",
    database: powerSyncDb,
    table: ticketSchema.props.ticket_comment,
    schema: ticketCommentSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketAttachmentUrlsCollection = createCollection(
  powerSyncCollectionOptions({
    id: "ticket-attachment-urls",
    database: powerSyncDb,
    table: ticketSchema.props.ticket_attachment_url,
    schema: ticketAttachmentSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketLinksCollection = createCollection(
  powerSyncCollectionOptions({
    id: "ticket-links",
    database: powerSyncDb,
    table: ticketSchema.props.ticket_link,
    schema: ticketLinkSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketDescriptionUpdatesCollection = createCollection(
  powerSyncCollectionOptions({
    id: "ticket-description-updates",
    database: powerSyncDb,
    table: ticketSchema.props.ticket_description_update,
    schema: ticketDescriptionUpdateSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketConflictsCollection = createCollection(
  powerSyncCollectionOptions({
    id: "ticket-conflicts",
    database: powerSyncDb,
    table: ticketSchema.props.ticket_conflict,
    schema: ticketConflictSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const ticketActivitiesCollection = createCollection(
  powerSyncCollectionOptions({
    id: "ticket-activities",
    database: powerSyncDb,
    table: ticketSchema.props.ticket_activity,
    schema: ticketActivitySchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

let readyPromise: Promise<void> | null = null;

export async function ensureTanStackDbReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await getPowerSync();
      await Promise.all([
        appUsersCollection.stateWhenReady(),
        ticketsCollection.stateWhenReady(),
        ticketAssignmentsCollection.stateWhenReady(),
        ticketCommentsCollection.stateWhenReady(),
        ticketAttachmentUrlsCollection.stateWhenReady(),
        ticketLinksCollection.stateWhenReady(),
        ticketDescriptionUpdatesCollection.stateWhenReady(),
        ticketConflictsCollection.stateWhenReady(),
        ticketActivitiesCollection.stateWhenReady(),
      ]);
    })();
  }

  return readyPromise;
}
