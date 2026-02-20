import { UpdateType } from "@powersync/common";
import { queryInternal } from "~/server/db";
import type { ServerSession } from "~/server/session";
import type {
  WriteOperation,
  WriteOperationResult,
} from "~/slices/sync-engine/types";

export async function applyPartUsageEventOperation(
  op: WriteOperation,
  session: ServerSession,
  opKey: string,
): Promise<WriteOperationResult> {
  if (op.op !== UpdateType.PUT) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "event_insert_only",
    };
  }

  const eventId = op.id;
  const workOrderId = String(op.opData.work_order_id ?? "");
  const partSku = String(op.opData.part_sku ?? "");
  const qtyDelta = Number(op.opData.qty_delta ?? 0);

  const existing = await queryInternal(`SELECT id FROM part_usage_event WHERE id = $1`, [eventId]);
  if (existing.rowCount) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "idempotent_duplicate",
    };
  }

  const inventoryResult = await queryInternal(
    `SELECT on_hand FROM part_inventory WHERE part_sku = $1`,
    [partSku],
  );

  if (!inventoryResult.rowCount) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "unknown_part_sku",
    };
  }

  const onHand = Number(inventoryResult.rows[0].on_hand);
  if (onHand + qtyDelta < 0) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "inventory_underflow",
    };
  }

  await queryInternal(
    `INSERT INTO part_usage_event (id, work_order_id, part_sku, qty_delta, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO NOTHING`,
    [eventId, workOrderId, partSku, qtyDelta, session.userId],
  );

  await queryInternal(
    `UPDATE part_inventory SET on_hand = on_hand + $1 WHERE part_sku = $2`,
    [qtyDelta, partSku],
  );

  return {
    opKey,
    table: op.table,
    id: op.id,
    result: "applied",
    reasonCode: "domain_event_applied",
  };
}
