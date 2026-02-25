import { queryInternal, withTransaction } from "~/server/db";

function parseConflictValue(raw: unknown): string | null {
  if (raw == null) return null;

  if (typeof raw === "object" && raw !== null && "value" in raw) {
    const value = (raw as { value?: unknown }).value;
    return value == null ? null : String(value);
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "value" in parsed) {
        const value = (parsed as { value?: unknown }).value;
        return value == null ? null : String(value);
      }
      return raw;
    } catch {
      return raw;
    }
  }

  return String(raw);
}

export async function resolveTicketConflict(args: {
  conflictId: string;
  strategy: "local" | "server" | "custom";
  resolvedBy: string;
  customValue?: string;
}) {
  const conflictResult = await queryInternal(
    `SELECT id, ticket_id, field_name, local_value, server_value, status
     FROM ticket_conflict
     WHERE id = $1`,
    [args.conflictId],
  );

  if (!conflictResult.rowCount) {
    throw new Error("Conflict not found");
  }

  const conflict = conflictResult.rows[0] as {
    id: string;
    ticket_id: string;
    field_name: string;
    local_value: unknown;
    server_value: unknown;
    status: "open" | "resolved" | "dismissed";
  };

  if (conflict.status !== "open") {
    throw new Error("Conflict is not open");
  }

  let resolvedValue: string | null = null;
  if (args.strategy === "local") {
    resolvedValue = parseConflictValue(conflict.local_value);
  } else if (args.strategy === "server") {
    resolvedValue = parseConflictValue(conflict.server_value);
  } else {
    resolvedValue = args.customValue ?? null;
  }

  await withTransaction(async (client) => {
    const fieldName = conflict.field_name;
    if (!["title", "description", "status"].includes(fieldName)) {
      throw new Error(`Unsupported conflict field: ${fieldName}`);
    }

    await client.query(
      `UPDATE ticket
       SET ${fieldName} = $1
       WHERE id = $2`,
      [resolvedValue, conflict.ticket_id],
    );

    await client.query(
      `UPDATE ticket_conflict
       SET status = 'resolved',
           resolved_value = $1::jsonb,
           resolved_by = $2,
           resolved_at = now()
       WHERE id = $3`,
      [JSON.stringify({ value: resolvedValue }), args.resolvedBy, args.conflictId],
    );

    await client.query(
      `INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by)
       VALUES (gen_random_uuid(), $1, 'conflict_resolved', $2, $3::jsonb, $4)`,
      [
        conflict.ticket_id,
        conflict.field_name,
        JSON.stringify({ strategy: args.strategy, value: resolvedValue }),
        args.resolvedBy,
      ],
    );
  });

  return {
    id: conflict.id,
    ticketId: conflict.ticket_id,
    field: conflict.field_name,
    value: resolvedValue,
  };
}
