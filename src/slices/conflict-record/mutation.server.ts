import { queryInternal } from "~/server/db";

export async function resolveConflictRecord(
  conflictId: string,
  strategy: "local" | "server" | "custom",
  resolvedBy: string,
  customValue?: string,
) {
  const conflictResult = await queryInternal(
    `SELECT id, entity_type, entity_id, field_name, local_value, server_value, status
     FROM conflict_record
     WHERE id = $1`,
    [conflictId],
  );

  if (!conflictResult.rowCount) {
    throw new Error("Conflict not found");
  }

  const conflict = conflictResult.rows[0] as {
    id: string;
    entity_type: string;
    entity_id: string;
    field_name: string;
    local_value: { value?: string | null };
    server_value: { value?: string | null };
    status: "open" | "resolved" | "dismissed";
  };

  if (conflict.status !== "open") {
    throw new Error("Conflict is not open");
  }

  let value: string | null = null;
  if (strategy === "local") {
    value = conflict.local_value?.value ?? null;
  } else if (strategy === "server") {
    value = conflict.server_value?.value ?? null;
  } else {
    value = customValue ?? null;
  }

  await queryInternal(
    `UPDATE work_order
     SET site_contact_phone = $1
     WHERE id = $2`,
    [value, conflict.entity_id],
  );

  await queryInternal(
    `UPDATE conflict_record
     SET status = 'resolved',
         resolved_value = $1::jsonb,
         resolved_by = $2,
         resolved_at = now()
     WHERE id = $3`,
    [JSON.stringify({ value }), resolvedBy, conflictId],
  );

  return {
    id: conflictId,
    value,
  };
}
