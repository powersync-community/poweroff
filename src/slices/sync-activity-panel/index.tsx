import { For, Show, createMemo } from "solid-js";
import { getSyncActivities } from "~/lib/sync-activity";

export function SyncActivityPanel() {
  const activities = createMemo(() => getSyncActivities());

  return (
    <section class="rounded border border-gray-200 bg-white p-4">
      <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Sync Activity</h3>
      <Show
        when={activities().length > 0}
        fallback={<div class="text-sm text-gray-500">No sync operations processed yet.</div>}
      >
        <div class="max-h-48 space-y-2 overflow-y-auto">
          <For each={activities()}>
            {(item) => (
              <div class="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                <div class="font-medium">
                  {item.table} / {item.entityId}
                </div>
                <div>
                  {item.result}
                  {item.reasonCode ? ` • ${item.reasonCode}` : ""}
                  {item.conflictId ? ` • conflict ${item.conflictId}` : ""}
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
