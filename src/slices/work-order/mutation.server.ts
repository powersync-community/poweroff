import { UpdateType } from "@powersync/common";
import { queryInternal } from "~/server/db";
import type { ServerSession } from "~/server/session";
import type {
  WriteOperation,
  WriteOperationResult,
} from "~/slices/sync-engine/types";

export async function applyWorkOrderOperation(
  op: WriteOperation,
  session: ServerSession,
  opKey: string,
): Promise<WriteOperationResult> {
  if (op.op === UpdateType.DELETE) {
    if (session.role !== "manager") {
      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "rejected",
        reasonCode: "restricted_delete",
      };
    }

    await queryInternal(
      `UPDATE work_order SET deleted_at = now() WHERE id = $1`,
      [op.id],
    );

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
    };
  }

  const currentResult = await queryInternal(
    `SELECT id, title, priority, status, site_contact_phone, version, updated_at
     FROM work_order
     WHERE id = $1`,
    [op.id],
  );

  if (!currentResult.rowCount) {
    if (op.op === UpdateType.PUT) {
      if (session.role !== "manager") {
        console.trace("[work-order] create rejected", {
          opKey,
          id: op.id,
          role: session.role,
        });
        return {
          opKey,
          table: op.table,
          id: op.id,
          result: "rejected",
          reasonCode: "restricted_create",
        };
      }

      const title = String(op.opData.title ?? "").trim();
      if (!title) {
        console.trace("[work-order] create rejected missing title", {
          opKey,
          id: op.id,
        });
        return {
          opKey,
          table: op.table,
          id: op.id,
          result: "rejected",
          reasonCode: "missing_title",
        };
      }

      const allowedPriorities = new Set(["low", "medium", "high"]);
      const incomingPriority = String(op.opData.priority ?? "medium");
      const priority = allowedPriorities.has(incomingPriority)
        ? incomingPriority
        : "medium";

      const assigneeId =
        op.opData.assignee_id == null ? null : String(op.opData.assignee_id);
      const siteContactPhone =
        op.opData.site_contact_phone == null
          ? null
          : String(op.opData.site_contact_phone);

      console.log("[work-order] create", {
        opKey,
        id: op.id,
        title,
        priority,
        assigneeId,
      });

      await queryInternal(
        `INSERT INTO work_order (
          id,
          title,
          priority,
          status,
          assignee_id,
          site_contact_phone,
          deleted_at,
          created_at,
          updated_at,
          version
        )
        VALUES ($1, $2, $3, 'open', $4, $5, NULL, now(), now(), 0)
        ON CONFLICT (id) DO UPDATE
        SET title = EXCLUDED.title,
            priority = EXCLUDED.priority,
            status = EXCLUDED.status,
            assignee_id = EXCLUDED.assignee_id,
            site_contact_phone = EXCLUDED.site_contact_phone,
            deleted_at = NULL,
            updated_at = now()`,
        [op.id, title, priority, assigneeId, siteContactPhone],
      );

      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "applied",
        reasonCode: "created",
      };
    }

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "rejected",
      reasonCode: "work_order_not_found",
    };
  }

  const current = currentResult.rows[0] as {
    id: string;
    title: string;
    priority: string;
    status: "open" | "in_progress" | "closed";
    site_contact_phone: string | null;
    version: number;
    updated_at: string;
  };

  if (op.op === UpdateType.PUT) {
    const title = String(op.opData.title ?? current.title);
    const priority = String(op.opData.priority ?? current.priority);

    await queryInternal(
      `UPDATE work_order
       SET title = $1, priority = $2
       WHERE id = $3`,
      [title, priority, op.id],
    );

    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "applied",
      reasonCode: "lww_fields",
    };
  }

  const updates: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (Object.hasOwn(op.opData, "title")) {
    updates.push(`title = $${idx++}`);
    params.push(String(op.opData.title));
  }

  if (Object.hasOwn(op.opData, "priority")) {
    updates.push(`priority = $${idx++}`);
    params.push(String(op.opData.priority));
  }

  let conflictId: string | undefined;
  let statusReason: string | undefined;

  if (Object.hasOwn(op.opData, "status")) {
    const nextStatus = String(op.opData.status) as
      | "open"
      | "in_progress"
      | "closed";
    if (session.role === "tech") {
      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "rejected",
        reasonCode: "restricted_status_transition",
      };
    }

    if (
      current.status === "closed" &&
      nextStatus === "open" &&
      session.role !== "manager"
    ) {
      return {
        opKey,
        table: op.table,
        id: op.id,
        result: "rejected",
        reasonCode: "restricted_reopen",
      };
    }

    updates.push(`status = $${idx++}`);
    params.push(nextStatus);
    statusReason = "status_transition";
  }

  if (Object.hasOwn(op.opData, "site_contact_phone")) {
    const incomingPhone =
      op.opData.site_contact_phone == null
        ? null
        : String(op.opData.site_contact_phone);
    const incomingVersion = Number(op.opData.version);
    const incomingUpdatedAt = Date.parse(String(op.opData.updated_at ?? ""));
    const serverUpdatedAt = Date.parse(String(current.updated_at ?? ""));
    const versionMismatch =
      (Number.isFinite(incomingVersion) &&
        incomingVersion < Number(current.version)) ||
      (Number.isFinite(incomingUpdatedAt) &&
        Number.isFinite(serverUpdatedAt) &&
        incomingUpdatedAt < serverUpdatedAt);

    if (versionMismatch && incomingPhone !== current.site_contact_phone) {
      const conflictInsert = await queryInternal(
        `INSERT INTO conflict_record (
          id,
          entity_type,
          entity_id,
          field_name,
          local_value,
          server_value,
          status
        )
        VALUES (gen_random_uuid(), 'work_order', $1, 'site_contact_phone', $2::jsonb, $3::jsonb, 'open')
        RETURNING id`,
        [
          op.id,
          JSON.stringify({ value: incomingPhone }),
          JSON.stringify({ value: current.site_contact_phone }),
        ],
      );
      conflictId = String(conflictInsert.rows[0].id);
    } else {
      updates.push(`site_contact_phone = $${idx++}`);
      params.push(incomingPhone);
    }
  }

  if (updates.length) {
    params.push(op.id);
    await queryInternal(
      `UPDATE work_order
       SET ${updates.join(", ")}
       WHERE id = $${idx}`,
      params,
    );
  }

  if (conflictId) {
    return {
      opKey,
      table: op.table,
      id: op.id,
      result: "needs_review",
      reasonCode: "manual_phone_conflict",
      conflictId,
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
    result: "applied",
    reasonCode: statusReason ?? "lww_fields",
  };
}
