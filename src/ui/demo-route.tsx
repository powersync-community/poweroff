import {
  ErrorBoundary,
  Show,
  Suspense,
  createResource,
  createSignal,
} from "solid-js";
import { ensureTanStackDbReady } from "~/lib/tanstack-db";
import { clientSession } from "~/lib/session";
import type { DemoStrategyId } from "~/domain/strategy";
import { DemoScreen } from "~/ui/demo-screen";

export function DemoRoute(props: { strategy: DemoStrategyId }) {
  const [selectedTicketId, setSelectedTicketId] = createSignal<
    string | undefined
  >(undefined);

  const [session] = createResource(clientSession, async (nextSession) => {
    await ensureTanStackDbReady();
    return nextSession;
  });

  return (
    <ErrorBoundary
      fallback={(error) => (
        <div class="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          Initialization failed: {String(error)}
        </div>
      )}
    >
      <Suspense
        fallback={
          <div class="p-4 text-sm text-gray-600">
            Initializing local sync...
          </div>
        }
      >
        <Show when={session()}>
          {(nextSession) => (
            <DemoScreen
              strategy={props.strategy}
              session={nextSession()}
              selectedTicketId={selectedTicketId()}
              onSelectTicket={setSelectedTicketId}
            />
          )}
        </Show>
      </Suspense>
    </ErrorBoundary>
  );
}
