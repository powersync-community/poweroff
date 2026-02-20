import { createMemo } from "solid-js";
import { useLiveQuery } from "@tanstack/solid-db";
import { workOrdersCollection } from "~/lib/tanstack-db";
import type { DemoSession } from "~/lib/session";

export type WorkOrderRow = {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "closed";
  assignee_id: string | null;
  updated_at: string;
  deleted_at: string | null;
};

export function useVisibleWorkOrders(session: DemoSession) {
  const ordersQuery = useLiveQuery((q) =>
    q
      .from({ workOrder: workOrdersCollection })
      .orderBy(({ workOrder }) => workOrder.updated_at, "desc")
      .select(({ workOrder }) => ({
        id: workOrder.id,
        title: workOrder.title,
        priority: workOrder.priority,
        status: workOrder.status,
        assignee_id: workOrder.assignee_id,
        updated_at: workOrder.updated_at,
        deleted_at: workOrder.deleted_at,
      })),
  );

  const visibleOrders = createMemo(() => {
    const all = (ordersQuery() as WorkOrderRow[]).filter(
      (order) => !order.deleted_at,
    );
    if (session.role === "manager") return all;
    return all.filter((order) => order.assignee_id === session.userId);
  });

  const autoSelectId = createMemo(() => visibleOrders()[0]?.id);

  return {
    ordersQuery,
    visibleOrders,
    autoSelectId,
  } as const;
}

export type WorkOrderListData = ReturnType<typeof useVisibleWorkOrders>;
