import { For } from "solid-js";
import { STRATEGY_ROUTES } from "~/domain/strategy";

export default function Home() {
  return (
    <main class="min-h-screen bg-slate-100 p-6 text-gray-900">
      <div class="mx-auto max-w-3xl space-y-4 rounded border border-gray-200 bg-white p-6">
        <h1 class="text-2xl font-semibold">Offline Ticket Demo</h1>
        <p class="text-sm text-gray-700">
          This demo is simplified around the blog narrative: additive offline
          operations, conflict strategy variants, manual resolution, and CRDT
          description updates.
        </p>

        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <For each={STRATEGY_ROUTES}>
            {(route) => (
              <a
                href={route.href}
                class="rounded border border-gray-200 bg-slate-50 p-3 transition hover:border-slate-400"
              >
                <div class="text-sm font-semibold text-gray-900">{route.title}</div>
                <div class="mt-1 text-xs text-gray-600">{route.summary}</div>
              </a>
            )}
          </For>
        </div>
      </div>
    </main>
  );
}
