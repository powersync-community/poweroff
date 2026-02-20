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
const [pendingCount, setPendingCount] = createSignal(0);

export function getSyncActivities() {
  return activities();
}

export function appendSyncActivities(items: SyncActivityItem[]) {
  if (!items.length) return;
  setActivities((prev) => [...items, ...prev].slice(0, 120));
}

export function queueLocalOperation(count = 1) {
  setPendingCount((prev) => Math.max(0, prev + count));
}

export function flushQueuedOperation(count = 1) {
  setPendingCount((prev) => Math.max(0, prev - count));
}

export function getPendingQueueCount() {
  return pendingCount();
}
