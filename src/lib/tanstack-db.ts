import { createCollection } from "@tanstack/solid-db";
import { powerSyncCollectionOptions } from "@tanstack/powersync-db-collection";
import { z } from "zod";
import {
  getPowerSync,
  powerSyncDb,
  workOrderSchema,
} from "~/lib/powersync.client";

export type AppDatabase = (typeof workOrderSchema)["types"];

const textColumn = z.union([z.string(), z.null(), z.undefined()]);
const intColumn = z.union([z.number(), z.null(), z.undefined()]);

const workOrderZodSchema = z.object({
  id: z.string(),
  title: textColumn,
  priority: textColumn,
  status: textColumn,
  assignee_id: textColumn,
  site_contact_phone: textColumn,
  deleted_at: textColumn,
  created_at: textColumn,
  updated_at: textColumn,
  version: intColumn,
});

const workOrderNoteZodSchema = z.object({
  id: z.string(),
  work_order_id: textColumn,
  crdt_payload: textColumn,
  updated_by: textColumn,
  updated_at: textColumn,
});

const partUsageEventZodSchema = z.object({
  id: z.string(),
  work_order_id: textColumn,
  part_sku: textColumn,
  qty_delta: intColumn,
  created_by: textColumn,
  created_at: textColumn,
});

const conflictRecordZodSchema = z.object({
  id: z.string(),
  entity_type: textColumn,
  entity_id: textColumn,
  field_name: textColumn,
  local_value: textColumn,
  server_value: textColumn,
  status: textColumn,
  resolved_value: textColumn,
  resolved_by: textColumn,
  created_at: textColumn,
  resolved_at: textColumn,
});

export const workOrdersCollection = createCollection(
  powerSyncCollectionOptions({
    id: "work-orders",
    database: powerSyncDb,
    table: workOrderSchema.props.work_order,
    schema: workOrderZodSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const workOrderNotesCollection = createCollection(
  powerSyncCollectionOptions({
    id: "work-order-notes",
    database: powerSyncDb,
    table: workOrderSchema.props.work_order_note,
    schema: workOrderNoteZodSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const partUsageEventsCollection = createCollection(
  powerSyncCollectionOptions({
    id: "part-usage-events",
    database: powerSyncDb,
    table: workOrderSchema.props.part_usage_event,
    schema: partUsageEventZodSchema,
    onDeserializationError(err) {
      console.error(err);
    },
  }),
);

export const conflictRecordsCollection = createCollection(
  powerSyncCollectionOptions({
    id: "conflict-records",
    database: powerSyncDb,
    table: workOrderSchema.props.conflict_record,
    schema: conflictRecordZodSchema,
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
        workOrdersCollection.stateWhenReady(),
        workOrderNotesCollection.stateWhenReady(),
        partUsageEventsCollection.stateWhenReady(),
        conflictRecordsCollection.stateWhenReady(),
      ]);
    })();
  }

  return readyPromise;
}
