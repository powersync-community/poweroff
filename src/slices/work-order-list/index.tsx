import { For, Show } from "solid-js";
import type { DemoSession } from "~/lib/session";
import type { WorkOrderListData } from "./query";

export function WorkOrderList(props: {
  session: DemoSession;
  data: Pick<WorkOrderListData, "ordersQuery" | "visibleOrders">;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const ordersQuery = () => props.data.ordersQuery;
  const visibleOrders = () => props.data.visibleOrders();

  return (
    <aside class="w-80 border-r border-gray-200 bg-white">
      <div class="border-b border-gray-100 px-4 py-3">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Work Orders
        </h2>
      </div>

      <Show when={ordersQuery().isLoading}>
        <div class="px-4 pt-3 text-sm text-gray-500">
          Loading work orders...
        </div>
      </Show>

      <div class="max-h-[calc(100vh-12rem)] overflow-y-auto p-2">
        <For each={visibleOrders()}>
          {(order) => (
            <button
              class={`mb-2 w-full rounded border px-3 py-2 text-left transition ${
                props.selectedId === order.id
                  ? "border-blue-400 bg-blue-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
              onClick={() => props.onSelect(order.id)}
            >
              <div class="text-sm font-medium text-gray-900">{order.title}</div>
              <div class="mt-1 flex gap-2 text-xs text-gray-600">
                <span>{order.priority}</span>
                <span>•</span>
                <span>{order.status}</span>
              </div>
            </button>
          )}
        </For>

        <Show when={!ordersQuery().isLoading && !visibleOrders().length}>
          <div class="rounded border border-dashed border-gray-300 p-3 text-sm text-gray-500">
            No work orders available for this role.
          </div>
        </Show>
      </div>
    </aside>
  );
}
