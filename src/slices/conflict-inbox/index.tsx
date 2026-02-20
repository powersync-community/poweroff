import { For, Show, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { eq, useLiveQuery } from "@tanstack/solid-db";
import { conflictRecordsCollection } from "~/lib/tanstack-db";
import { resolveConflict } from "~/server/powersync";
import type { DemoSession } from "~/lib/session";

function parseConflictValue(raw: unknown): string {
  if (!raw) return "";
  if (typeof raw === "object" && raw !== null && "value" in raw) {
    return String((raw as any).value ?? "");
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "value" in parsed) {
        return String((parsed as any).value ?? "");
      }
      return raw;
    } catch {
      return raw;
    }
  }
  return String(raw);
}

export function ConflictInbox(props: { session: DemoSession }) {
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [customDrafts, setCustomDrafts] = createStore<Record<string, string>>({});
  const [error, setError] = createSignal("");

  const openConflicts = useLiveQuery((q) =>
    q
      .from({ conflict: conflictRecordsCollection })
      .where(({ conflict }) => eq(conflict.status, "open"))
      .orderBy(({ conflict }) => conflict.created_at, "desc")
      .select(({ conflict }) => ({
        id: conflict.id,
        entity_id: conflict.entity_id,
        field_name: conflict.field_name,
        local_value: conflict.local_value,
        server_value: conflict.server_value,
        created_at: conflict.created_at,
      })),
  );

  const handleResolve = async (
    id: string,
    strategy: "local" | "server" | "custom",
  ) => {
    setError("");
    setBusyId(id);

    try {
      await resolveConflict(id, strategy, customDrafts[id]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to resolve conflict");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section class="rounded border border-gray-200 bg-white p-4">
      <div class="mb-2 flex items-center justify-between">
        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">Conflict Inbox</h3>
        <span class="text-xs text-gray-500">{openConflicts().length} open</span>
      </div>

      <Show
        when={props.session.role === "manager"}
        fallback={<div class="text-sm text-gray-500">Manager role required to resolve conflicts.</div>}
      >
        <Show
          when={openConflicts().length > 0}
          fallback={<div class="text-sm text-gray-500">No open conflicts.</div>}
        >
          <div class="max-h-64 space-y-2 overflow-y-auto">
            <For each={openConflicts()}>
              {(conflict) => (
                <div class="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  <div class="font-semibold">
                    {conflict.field_name} on {conflict.entity_id}
                  </div>
                  <div class="mt-1">Local: {parseConflictValue(conflict.local_value)}</div>
                  <div>Server: {parseConflictValue(conflict.server_value)}</div>
                  <input
                    class="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                    placeholder="Custom value"
                    value={customDrafts[conflict.id] ?? ""}
                    onInput={(e) => setCustomDrafts(conflict.id, e.currentTarget.value)}
                  />
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      class="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                      disabled={busyId() === conflict.id}
                      onClick={() => handleResolve(conflict.id, "local")}
                    >
                      Keep Local
                    </button>
                    <button
                      class="rounded bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white"
                      disabled={busyId() === conflict.id}
                      onClick={() => handleResolve(conflict.id, "server")}
                    >
                      Keep Server
                    </button>
                    <button
                      class="rounded bg-slate-500 px-2 py-1 text-[11px] font-semibold text-white"
                      disabled={busyId() === conflict.id}
                      onClick={() => handleResolve(conflict.id, "custom")}
                    >
                      Use Custom
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <Show when={error()}>
        <div class="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">{error()}</div>
      </Show>
    </section>
  );
}
