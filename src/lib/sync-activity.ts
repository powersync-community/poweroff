import { createSignal } from "solid-js";

export type SyncOutcome = "applied" | "merged" | "rejected" | "needs_review";

export type SyncActivityItem = {
  id: string;
  at: string;
  table: string;
  entityId: string;
  result: SyncOutcome;
  reasonCode?: string;
  conflictId?: string;
};

const [activities, setActivities] = createSignal<SyncActivityItem[]>([]);

export function getSyncActivities() {
  return activities();
}

export function appendSyncActivities(items: SyncActivityItem[]) {
  if (!items.length) return;
  setActivities((prev) => [...items, ...prev].slice(0, 120));
}
