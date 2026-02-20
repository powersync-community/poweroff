import { UpdateType } from "@powersync/common";
import { queryInternal } from "~/server/db";
import type { ServerSession } from "~/server/session";
import type {
  WriteOperation,
  WriteOperationResult,
} from "~/slices/sync-engine/types";

function normalizeByteaInput(value: string | null | undefined): string {
  if (!value) return "";
  if (value.startsWith("\\x")) {
    return Buffer.from(value.slice(2), "hex").toString("utf8");
  }
  return value;
}

function toHexBytea(value: string): string {
  return `\\x${Buffer.from(value, "utf8").toString("hex")}`;
}

function mergeCrdtPayload(serverValue: string, clientValue: string): string {
  const left = serverValue
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const right = clientValue
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of [...left, ...right]) {
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
  }

  return merged.join("\n");
}

export async function applyWorkOrderNoteOperation(
  op: WriteOperation,
  session: ServerSession,
  opKey: string,
): Promise<WriteOperationResult> {
  if (op.op === UpdateType.DELETE) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "restricted_note_delete",
    };
  }

  const noteId = String(op.id);
  const workOrderId = String(op.opData.work_order_id ?? op.id);
  const incomingPayload = normalizeByteaInput(String(op.opData.crdt_payload ?? ""));

  const existingResult = await queryInternal(
    `SELECT encode(crdt_payload, 'hex') as payload_hex
     FROM work_order_note
     WHERE work_order_id = $1`,
    [workOrderId],
  );

  const existingPayload = existingResult.rowCount
    ? Buffer.from(String(existingResult.rows[0].payload_hex), "hex").toString("utf8")
    : "";

  const mergedPayload = mergeCrdtPayload(existingPayload, incomingPayload);
  const byteaHex = toHexBytea(mergedPayload);

  await queryInternal(
    `INSERT INTO work_order_note (id, work_order_id, crdt_payload, updated_by, updated_at)
     VALUES ($1, $2, decode(substr($3, 3), 'hex'), $4, now())
     ON CONFLICT (id) DO UPDATE
     SET work_order_id = $2,
         crdt_payload = decode(substr($3, 3), 'hex'),
         updated_by = $4,
         updated_at = now()`,
    [noteId, workOrderId, byteaHex, session.userId],
  );

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: existingPayload ? "merged" : "applied",
    reasonCode: existingPayload ? "crdt_merge" : "note_upsert",
  };
}
