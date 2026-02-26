import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncDatabase,
} from "@powersync/web";
import { column, Schema, Table } from "@powersync/web";
import { getPowerSyncToken, uploadData } from "~/server/powersync";
import {
  appendSyncActivities,
  type SyncActivityItem,
} from "~/lib/sync-activity";
import { isSyncPaused } from "~/sync/control";

export type SerializableCrudEntry = {
  op: string | number;
  table: string;
  id: string;
  opData?: Record<string, unknown>;
};

function toSerializableCrud(
  rows: Array<{
    op: string | number;
    table: string;
    id: string;
    opData?: Record<string, unknown>;
  }>,
): SerializableCrudEntry[] {
  return rows.map((row) => ({
    op: row.op,
    table: String(row.table),
    id: String(row.id),
    opData: row.opData
      ? (JSON.parse(JSON.stringify(row.opData)) as Record<string, unknown>)
      : {},
  }));
}

class TicketConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const { token, expiresAt } = await getPowerSyncToken();
    const endpoint = import.meta.env.VITE_POWERSYNC_URL;
    return {
      endpoint,
      token,
      expiresAt: new Date(expiresAt),
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    while (true) {
      if (isSyncPaused()) {
        console.log(
          "[powersync] paused while uploading; stop current drain loop",
        );
        break;
      }

      const transaction = await database.getNextCrudTransaction();
      if (!transaction) {
        break;
      }

      if (isSyncPaused()) {
        console.log("[powersync] paused before completing transaction");
        break;
      }

      const serializableCrud = toSerializableCrud(transaction.crud as any[]);
      console.log("[powersync] uploading crud transaction", {
        size: serializableCrud.length,
        first: serializableCrud[0]
          ? {
              op: serializableCrud[0].op,
              table: serializableCrud[0].table,
              id: serializableCrud[0].id,
            }
          : null,
      });
      console.trace("[powersync] upload trace");

      const response = await uploadData(serializableCrud as any);
      if (!response.success) {
        console.error("[powersync] upload response failed", response);
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

      await transaction.complete();
    }
  }
}

export const ticketSchema = new Schema({
  app_user: new Table({
    id: column.text,
    name: column.text,
  }),
  ticket: new Table(
    {
      id: column.text,
      title: column.text,
      description: column.text,
      status: column.text,
      deleted_at: column.text,
      created_at: column.text,
      updated_at: column.text,
      version: column.integer,
    },
    {
      indexes: {
        idx_ticket_status: ["status"],
      },
    },
  ),
  ticket_assignment: new Table(
    {
      id: column.text,
      ticket_id: column.text,
      user_id: column.text,
      deleted_at: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        idx_ticket_assignment_ticket: ["ticket_id", "created_at"],
      },
    },
  ),
  ticket_comment: new Table(
    {
      id: column.text,
      ticket_id: column.text,
      body: column.text,
      created_by: column.text,
      deleted_at: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        idx_ticket_comment_ticket: ["ticket_id", "created_at"],
      },
    },
  ),
  ticket_attachment_url: new Table(
    {
      id: column.text,
      ticket_id: column.text,
      url: column.text,
      url_hash: column.text,
      created_by: column.text,
      deleted_at: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        idx_ticket_attachment_ticket: ["ticket_id", "created_at"],
      },
    },
  ),
  ticket_link: new Table(
    {
      id: column.text,
      ticket_id: column.text,
      url: column.text,
      created_by: column.text,
      deleted_at: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        idx_ticket_link_ticket: ["ticket_id", "created_at"],
      },
    },
  ),
  ticket_description_update: new Table(
    {
      id: column.text,
      ticket_id: column.text,
      update_b64: column.text,
      created_by: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        idx_ticket_description_update_ticket: ["ticket_id", "created_at"],
      },
    },
  ),
  ticket_conflict: new Table(
    {
      id: column.text,
      ticket_id: column.text,
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
        idx_ticket_conflict_status: ["status", "created_at"],
      },
    },
  ),
  ticket_activity: new Table(
    {
      id: column.text,
      ticket_id: column.text,
      action: column.text,
      field_name: column.text,
      details: column.text,
      created_by: column.text,
      created_at: column.text,
    },
    {
      indexes: {
        idx_ticket_activity_ticket: ["ticket_id", "created_at"],
      },
    },
  ),
});

export const powerSyncDb = new PowerSyncDatabase({
  schema: ticketSchema,
  database: {
    dbFilename: "ticket-demo.db",
  },
});

const connector = new TicketConnector();
let connectPromise: Promise<void> | null = null;
let connectionTransitionPromise: Promise<void> = Promise.resolve();

export async function getPowerSync() {
  if (!connectPromise) {
    connectPromise = (async () => {
      console.log("[powersync] connecting");
      await powerSyncDb.connect(connector);
      await powerSyncDb.waitForReady();
      console.log("[powersync] connected");
    })().catch((error) => {
      console.error("[powersync] failed to connect", error);
      connectPromise = null;
      throw error;
    });
  }

  await connectPromise;
  return powerSyncDb;
}

export async function setPowerSyncConnectionPaused(paused: boolean) {
  const operation = connectionTransitionPromise.then(async () => {
    if (paused && !connectPromise) {
      console.log(
        "[powersync] pause requested before initial connect; skipping disconnect",
      );
      return;
    }

    const db = await getPowerSync();
    console.log("[powersync] set connection paused", {
      paused,
      connected: db.connected,
    });
    console.trace("[powersync] set connection paused trace");

    if (paused) {
      if (!db.connected) {
        console.log("[powersync] already disconnected");
        return;
      }

      await db.disconnect();
      console.log("[powersync] disconnected while paused");
      return;
    }

    if (db.connected) {
      console.log("[powersync] already connected");
      return;
    }

    await db.connect(connector);
    await db.waitForReady();
    console.log("[powersync] reconnected after pause");
  });

  connectionTransitionPromise = operation.catch(() => undefined);
  await operation;
}
