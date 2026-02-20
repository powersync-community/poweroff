import { createHash } from "node:crypto";
import { queryInternal } from "~/server/db";
import type { ServerSession } from "~/server/session";
import { applyPartUsageEventOperation } from "~/slices/part-usage-event/mutation.server";
import { applyWorkOrderNoteOperation } from "~/slices/work-order-note/mutation.server";
import { applyWorkOrderOperation } from "~/slices/work-order/mutation.server";
import type {
  WriteOperation,
  WriteOperationResult,
  WriteResultCode,
} from "~/slices/sync-engine/types";

function toOpKey(op: WriteOperation, session: ServerSession) {
  const payload = JSON.stringify({
    op: op.op,
    table: op.table,
    id: op.id,
    opData: op.opData ?? {},
    userId: session.userId,
    role: session.role,
  });
  return createHash("sha1").update(payload).digest("hex");
}

async function applyOperation(
  op: WriteOperation,
  session: ServerSession,
  opKey: string,
): Promise<WriteOperationResult> {
  try {
    if (op.table === "work_order") {
      return await applyWorkOrderOperation(op, session, opKey);
    }

    if (op.table === "work_order_note") {
      return await applyWorkOrderNoteOperation(op, session, opKey);
    }

    if (op.table === "part_usage_event") {
      return await applyPartUsageEventOperation(op, session, opKey);
    }

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "unsupported_table",
    };
  } catch (error) {
    console.error("[sync-engine] op failed", {
      opKey,
      table: op.table,
      id: op.id,
      error,
    });
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "server_error",
    };
  }
}

async function resolveWithDedupe(
  op: WriteOperation,
  session: ServerSession,
): Promise<WriteOperationResult> {
  const opKey = toOpKey(op, session);

  const existing = await queryInternal(
    `SELECT result_code, reason_code, conflict_id
     FROM sync_operation
     WHERE op_key = $1`,
    [opKey],
  );

  if (existing.rowCount) {
    const row = existing.rows[0] as {
      result_code: WriteResultCode;
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
  operations: WriteOperation[],
  session: ServerSession,
): Promise<WriteOperationResult[]> {
  const results: WriteOperationResult[] = [];

  for (const operation of operations) {
    const result = await resolveWithDedupe(operation, session);
    console.log("[sync-engine] op", {
      opKey: result.opKey,
      table: result.table,
      id: result.id,
      result: result.result,
      reasonCode: result.reasonCode,
      conflictId: result.conflictId,
      role: session.role,
      userId: session.userId,
    });

    results.push(result);
  }

  return results;
}
