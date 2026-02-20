import {
  PowerSyncDatabase,
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  createBaseLogger,
  LogLevel,
} from "@powersync/web";
import { column, Schema, Table } from "@powersync/web";
import { getPowerSyncToken } from "~/slices/sync-engine/query.token.server";
import { uploadData as uploadToServer } from "~/slices/sync-engine/mutation.upload.server";
import {
  appendSyncActivities,
  flushQueuedOperation,
  type SyncActivityItem,
} from "~/lib/sync-activity";

class WorkOrderConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { token, expiresAt } = await getPowerSyncToken();
    const endpoint = import.meta.env.VITE_POWERSYNC_URL;
    return { endpoint, token, expiresAt: new Date(expiresAt) };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    while (true) {
      const transaction = await database.getNextCrudTransaction();
      if (!transaction) {
        break;
      }

      const payload = transaction.crud.map((op) => ({
        op: op.op,
        table: op.table,
        id: op.id,
        opData: op.opData ?? {},
      }));

      const response = await uploadToServer(payload);
      if (!response.success) {
        throw new Error(response.error || "write_batch_failed");
      }

      const now = new Date().toISOString();
      const activityRows: SyncActivityItem[] = (response.results ?? []).map(
        (row: any, idx: number) => ({
          id: `${row.opKey ?? `${row.table}-${row.id}-${idx}`}-${Date.now()}`,
          at: now,
          table: row.table,
          entityId: row.id,
          result: row.result,
          reasonCode: row.reasonCode,
          conflictId: row.conflictId,
        }),
      );

      appendSyncActivities(activityRows);
      flushQueuedOperation(activityRows.length || transaction.crud.length);

      await transaction.complete();
    }
  }
}

export const workOrderSchema = new Schema({
  app_user: new Table({
    id: column.text,
    name: column.text,
    role: column.text,
  }),
  work_order: new Table(
    {
      id: column.text,
      title: column.text,
      priority: column.text,
      status: column.text,
      assignee_id: column.text,
      site_contact_phone: column.text,
      deleted_at: column.text,
      created_at: column.text,
      updated_at: column.text,
      version: column.integer,
    },
    {
      indexes: {
        idx_work_order_assignee: ["assignee_id"],
        idx_work_order_status: ["status"],
      },
    },
  ),
  work_order_note: new Table({
    id: column.text,
    work_order_id: column.text,
    crdt_payload: column.text,
    updated_by: column.text,
    updated_at: column.text,
  }),
  part_usage_event: new Table(
    {
      id: column.text,
      work_order_id: column.text,
      part_sku: column.text,
      qty_delta: column.integer,
      created_by: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        idx_part_usage_event_work_order: ["work_order_id", "created_at"],
      },
    },
  ),
  part_inventory: new Table({
    part_sku: column.text,
    on_hand: column.integer,
  }),
  conflict_record: new Table(
    {
      id: column.text,
      entity_type: column.text,
      entity_id: column.text,
      field_name: column.text,
      local_value: column.text,
      server_value: column.text,
      status: column.text,
      resolved_value: column.text,
      resolved_by: column.text,
      created_at: column.text,
      resolved_at: column.text,
    },
    {
      indexes: {
        idx_conflict_record_status: ["status", "created_at"],
      },
    },
  ),
});

export const powerSyncDb = new PowerSyncDatabase({
  schema: workOrderSchema,
  database: {
    dbFilename: "work-orders-demo.db",
  },
});

let connectPromise: Promise<void> | null = null;
const logger = createBaseLogger();
logger.setLevel(LogLevel.INFO);

const connector = new WorkOrderConnector();

export async function getPowerSync() {
  if (!connectPromise) {
    connectPromise = (async () => {
      console.log(`connecting powesync`);
      await powerSyncDb.connect(connector);
      console.log(`connecting powesync 2`);
      await powerSyncDb.waitForReady();
      console.log(`connecting powesync 3`);
    })().catch((error) => {
      console.error("Error connecting to PowerSync:", error);
      connectPromise = null;
      throw error;
    });
  }

  await connectPromise;
  return powerSyncDb;
}
