import { createSignal } from "solid-js";

const [syncPaused, setSyncPausedSignal] = createSignal(false);

export function isSyncPaused() {
  return syncPaused();
}

export function setSyncPaused(next: boolean) {
  console.log("[sync-control] set sync paused", { next });
  setSyncPausedSignal(next);
}

export function toggleSyncPaused() {
  setSyncPaused(!syncPaused());
}
