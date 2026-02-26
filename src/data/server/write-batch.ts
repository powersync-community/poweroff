import { createHash } from "node:crypto";
import { UpdateType } from "@powersync/common";
import { queryInternal, withTransaction } from "~/server/db";
import type { ServerSession } from "~/server/session";
import type { UploadResult, SyncOutcome } from "~/sync/types";
import { SerializableCrudEntry } from "~/lib/powersync.client";

type TicketStatus = "pending" | "in_progress" | "done";

function toOpKey(op: SerializableCrudEntry, session: ServerSession) {
  const payload = JSON.stringify({
    op: op.op,
    table: op.table,
    id: op.id,
    opData: op.opData ?? {},
    userId: session.userId,
  });

  return createHash("sha1").update(payload).digest("hex");
}

function asText(value: unknown) {
  if (value == null) return "";
  return String(value);
}

function normalizeStatus(value: unknown): TicketStatus | null {
  const next = String(value ?? "").trim();
  if (next === "pending" || next === "in_progress" || next === "done") {
    return next;
  }
  return null;
}

async function insertActivity(args: {
  ticketId: string;
  action: string;
  fieldName?: string;
  details?: Record<string, unknown>;
  userId?: string;
}) {
  await queryInternal(
    `INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)`,
    [
      args.ticketId,
      args.action,
      args.fieldName ?? null,
      JSON.stringify(args.details ?? {}),
      args.userId ?? null,
    ],
  );
}

async function applyTicketOperation(
  op: SerializableCrudEntry,
  session: ServerSession,
  opKey: string,
): Promise<UploadResult> {
  const opData = (op.opData ?? {}) as Record<string, unknown>;

  if (op.op === UpdateType.DELETE) {
    await queryInternal(`UPDATE ticket SET deleted_at = now() WHERE id = $1`, [
      op.id,
    ]);
    await insertActivity({
      ticketId: op.id,
      action: "ticket_deleted",
      userId: session.userId,
    });

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "ticket_soft_deleted",
    };
  }

  const currentResult = await queryInternal(
    `SELECT id, title, description, status, version FROM ticket WHERE id = $1`,
    [op.id],
  );

  if (!currentResult.rowCount) {
    if (op.op !== UpdateType.PUT) {
      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "rejected",
        reasonCode: "ticket_not_found",
      };
    }

    const title = asText(opData.title).trim();
    if (!title) {
      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "rejected",
        reasonCode: "missing_title",
      };
    }

    const description = asText(opData.description);
    const status = normalizeStatus(opData.status) ?? "pending";

    await queryInternal(
      `INSERT INTO ticket (id, title, description, status, deleted_at, created_at, updated_at, version)
       VALUES ($1, $2, $3, $4, NULL, now(), now(), 0)
       ON CONFLICT (id) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           status = EXCLUDED.status,
           deleted_at = NULL,
           updated_at = now()`,
      [op.id, title, description, status],
    );

    await insertActivity({
      ticketId: op.id,
      action: "ticket_created",
      userId: session.userId,
      details: { title, status },
    });

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "ticket_created",
    };
  }

  const current = currentResult.rows[0] as {
    title: string;
    description: string;
    status: TicketStatus;
    version: number;
  };

  const updates: Array<{ field: string; value: unknown }> = [];
  let blockedStatus = false;
  let conflictId: string | undefined;

  if (Object.hasOwn(opData, "title")) {
    const nextTitle = asText(opData.title).trim();
    if (!nextTitle) {
      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "rejected",
        reasonCode: "missing_title",
      };
    }

    if (nextTitle !== current.title) {
      const conflictInsert = await queryInternal(
        `INSERT INTO ticket_conflict (
          id,
          ticket_id,
          field_name,
          local_value,
          server_value,
          status
        )
        VALUES (gen_random_uuid(), $1, 'title', $2::jsonb, $3::jsonb, 'open')
        RETURNING id`,
        [
          op.id,
          JSON.stringify({ value: nextTitle }),
          JSON.stringify({ value: current.title }),
        ],
      );

      conflictId = String(conflictInsert.rows[0].id);
    } else {
      updates.push({ field: "title", value: nextTitle });
    }
  }

  if (Object.hasOwn(opData, "description")) {
    updates.push({ field: "description", value: asText(opData.description) });
  }

  if (Object.hasOwn(opData, "status")) {
    const nextStatus = normalizeStatus(opData.status);
    if (!nextStatus) {
      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "rejected",
        reasonCode: "invalid_status",
      };
    }

    if (current.status === "done" && nextStatus !== "done") {
      blockedStatus = true;
    } else {
      updates.push({ field: "status", value: nextStatus });
    }
  }

  if (updates.length > 0) {
    const assignments = updates.map(
      (update, idx) => `${update.field} = $${idx + 1}`,
    );
    const params = updates.map((update) => update.value);
    params.push(op.id);

    await queryInternal(
      `UPDATE ticket
       SET ${assignments.join(", ")}
       WHERE id = $${params.length}`,
      params,
    );

    for (const update of updates) {
      await queryInternal(
        `INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::jsonb, $5)`,
        [
          op.id,
          `ticket_field_updated`,
          update.field ?? null,
          JSON.stringify({ value: update.value }),
          session.userId ?? null,
        ],
      );
    }
  }

  if (conflictId) {
    await insertActivity({
      ticketId: op.id,
      action: "ticket_conflict_created",
      fieldName: "title",
      userId: session.userId,
      details: { conflictId },
    });

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "needs_review",
      reasonCode: "manual_title_conflict",
      conflictId,
    };
  }

  if (blockedStatus && updates.length === 0) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "merged",
      reasonCode: "domain_done_wins",
    };
  }

  if (!updates.length) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "no_supported_fields",
    };
  }

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: blockedStatus ? "merged" : "applied",
    reasonCode: blockedStatus ? "domain_done_wins" : "ticket_updated",
  };
}

async function applyTicketAssignmentOperation(
  op: SerializableCrudEntry,
  session: ServerSession,
  opKey: string,
): Promise<UploadResult> {
  if (op.op === UpdateType.DELETE) {
    await queryInternal(
      `UPDATE ticket_assignment SET deleted_at = now() WHERE id = $1`,
      [op.id],
    );

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "assignment_removed",
    };
  }

  const opData = (op.opData ?? {}) as Record<string, unknown>;
  const ticketId = asText(opData.ticket_id).trim();
  const userId = asText(opData.user_id).trim();

  if (!ticketId || !userId) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "invalid_assignment_payload",
    };
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO ticket_assignment (id, ticket_id, user_id, deleted_at, created_at)
       VALUES ($1, $2, $3, NULL, now())
       ON CONFLICT (ticket_id, user_id)
       DO UPDATE SET deleted_at = NULL`,
      [op.id, ticketId, userId],
    );

    await client.query(
      `INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by)
       VALUES (gen_random_uuid(), $1, 'assignment_added', 'assignee', $2::jsonb, $3)`,
      [ticketId, JSON.stringify({ userId }), session.userId],
    );
  });

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: "applied",
    reasonCode: "assignment_upserted",
  };
}

async function applyTicketCommentOperation(
  op: SerializableCrudEntry,
  session: ServerSession,
  opKey: string,
): Promise<UploadResult> {
  if (op.op === UpdateType.DELETE) {
    await queryInternal(
      `UPDATE ticket_comment SET deleted_at = now() WHERE id = $1`,
      [op.id],
    );
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "comment_removed",
    };
  }

  const opData = (op.opData ?? {}) as Record<string, unknown>;
  const ticketId = asText(opData.ticket_id).trim();
  const body = asText(opData.body).trim();

  if (!ticketId || !body) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "invalid_comment_payload",
    };
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO ticket_comment (id, ticket_id, body, created_by, deleted_at, created_at)
       VALUES ($1, $2, $3, $4, NULL, now())
       ON CONFLICT (id)
       DO UPDATE SET body = EXCLUDED.body, deleted_at = NULL`,
      [op.id, ticketId, body, session.userId],
    );

    await client.query(
      `INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by)
       VALUES (gen_random_uuid(), $1, 'comment_added', 'comment', $2::jsonb, $3)`,
      [ticketId, JSON.stringify({ commentId: op.id }), session.userId],
    );
  });

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: "applied",
    reasonCode: "comment_upserted",
  };
}

async function applyTicketAttachmentUrlOperation(
  op: SerializableCrudEntry,
  session: ServerSession,
  opKey: string,
): Promise<UploadResult> {
  if (op.op === UpdateType.DELETE) {
    await queryInternal(
      `UPDATE ticket_attachment_url SET deleted_at = now() WHERE id = $1`,
      [op.id],
    );

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "attachment_removed",
    };
  }

  const opData = (op.opData ?? {}) as Record<string, unknown>;
  const ticketId = asText(opData.ticket_id).trim();
  const url = asText(opData.url).trim();
  if (!ticketId || !url) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "invalid_attachment_payload",
    };
  }

  const urlHash =
    asText(opData.url_hash).trim() ||
    createHash("md5").update(url).digest("hex");

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO ticket_attachment_url (
        id,
        ticket_id,
        url,
        url_hash,
        created_by,
        deleted_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, NULL, now())
      ON CONFLICT (ticket_id, url_hash)
      DO UPDATE SET url = EXCLUDED.url, deleted_at = NULL`,
      [op.id, ticketId, url, urlHash, session.userId],
    );

    await client.query(
      `INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by)
       VALUES (gen_random_uuid(), $1, 'attachment_added', 'attachment_url', $2::jsonb, $3)`,
      [ticketId, JSON.stringify({ url }), session.userId],
    );
  });

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: "applied",
    reasonCode: "attachment_upserted",
  };
}

async function applyTicketLinkOperation(
  op: SerializableCrudEntry,
  session: ServerSession,
  opKey: string,
): Promise<UploadResult> {
  if (op.op === UpdateType.DELETE) {
    await queryInternal(
      `UPDATE ticket_link SET deleted_at = now() WHERE id = $1`,
      [op.id],
    );
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "link_removed",
    };
  }

  const opData = (op.opData ?? {}) as Record<string, unknown>;
  const ticketId = asText(opData.ticket_id).trim();
  const url = asText(opData.url).trim();

  if (!ticketId || !url) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "invalid_link_payload",
    };
  }

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO ticket_link (id, ticket_id, url, created_by, deleted_at, created_at)
       VALUES ($1, $2, $3, $4, NULL, now())
       ON CONFLICT (id) DO UPDATE
       SET url = EXCLUDED.url, deleted_at = NULL`,
      [op.id, ticketId, url, session.userId],
    );

    await client.query(
      `INSERT INTO ticket_activity (id, ticket_id, action, field_name, details, created_by)
       VALUES (gen_random_uuid(), $1, 'link_added', 'link', $2::jsonb, $3)`,
      [ticketId, JSON.stringify({ url }), session.userId],
    );
  });

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: "applied",
    reasonCode: "link_upserted",
  };
}

async function applyTicketDescriptionUpdateOperation(
  op: SerializableCrudEntry,
  session: ServerSession,
  opKey: string,
): Promise<UploadResult> {
  if (op.op === UpdateType.DELETE) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "description_update_delete_not_supported",
    };
  }

  const opData = (op.opData ?? {}) as Record<string, unknown>;
  const ticketId = asText(opData.ticket_id).trim();
  const updateB64 = asText(opData.update_b64).trim();

  if (!ticketId || !updateB64) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "invalid_description_update_payload",
    };
  }

  const result = await queryInternal(
    `INSERT INTO ticket_description_update (id, ticket_id, update_b64, created_by, created_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO NOTHING`,
    [op.id, ticketId, updateB64, session.userId],
  );

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: "applied",
    reasonCode:
      (result.rowCount ?? 0) === 0
        ? "description_update_duplicate"
        : "description_update_inserted",
  };
}

async function applyOperation(
  op: SerializableCrudEntry,
  session: ServerSession,
  opKey: string,
): Promise<UploadResult> {
  if (op.table === "ticket") {
    return applyTicketOperation(op, session, opKey);
  }

  if (op.table === "ticket_assignment") {
    return applyTicketAssignmentOperation(op, session, opKey);
  }

  if (op.table === "ticket_comment") {
    return applyTicketCommentOperation(op, session, opKey);
  }

  if (op.table === "ticket_attachment_url") {
    return applyTicketAttachmentUrlOperation(op, session, opKey);
  }

  if (op.table === "ticket_link") {
    return applyTicketLinkOperation(op, session, opKey);
  }

  if (op.table === "ticket_description_update") {
    return applyTicketDescriptionUpdateOperation(op, session, opKey);
  }

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: "rejected",
    reasonCode: "unsupported_table",
  };
}

async function resolveWithDedupe(
  op: SerializableCrudEntry,
  session: ServerSession,
): Promise<UploadResult> {
  const opKey = toOpKey(op, session);

  const existing = await queryInternal(
    `SELECT result_code, reason_code, conflict_id
     FROM sync_operation
     WHERE op_key = $1`,
    [opKey],
  );

  if (existing.rowCount) {
    const row = existing.rows[0] as {
      result_code: SyncOutcome;
      reason_code: string | null;
      conflict_id: string | null;
    };

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: row.result_code,
      reasonCode: row.reason_code ?? undefined,
      conflictId: row.conflict_id ?? undefined,
    };
  }

  const resolved = await applyOperation(op, session, opKey);

  await queryInternal(
    `INSERT INTO sync_operation (op_key, result_code, reason_code, conflict_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (op_key) DO NOTHING`,
    [
      opKey,
      resolved.result,
      resolved.reasonCode ?? null,
      resolved.conflictId ?? null,
    ],
  );

  return resolved;
}

export async function processWriteBatch(
  operations: SerializableCrudEntry[],
  session: ServerSession,
) {
  const results: UploadResult[] = [];

  for (const operation of operations) {
    const result = await resolveWithDedupe(operation, session);
    console.log("[write-batch] processed operation", {
      opKey: result.opKey,
      table: result.table,
      id: result.id,
      result: result.result,
      reasonCode: result.reasonCode,
      conflictId: result.conflictId,
      userId: session.userId,
    });

    results.push(result);
  }

  return results;
}
