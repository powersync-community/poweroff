import {
  ErrorBoundary,
  Show,
  Suspense,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { eq, useLiveQuery } from "@tanstack/solid-db";
import { StatusBar } from "~/slices/status-bar";
import { WorkOrderList } from "~/slices/work-order-list";
import { WorkOrderDetail } from "~/slices/work-order-detail";
import { SyncActivityPanel } from "~/slices/sync-activity-panel";
import { ConflictInbox } from "~/slices/conflict-inbox";
import { DemoSession, clientSession } from "~/lib/session";
import {
  ensureTanStackDbReady,
  conflictRecordsCollection,
} from "~/lib/tanstack-db";
import { useVisibleWorkOrders } from "~/slices/work-order-list/query";

function HomeContent(props: {
  session: DemoSession;
  selectedOrderId?: string;
  onSelectOrder: (id: string) => void;
}) {
  const workOrders = useVisibleWorkOrders(props.session);
  const effectiveSelectedId = createMemo(
    () => props.selectedOrderId ?? workOrders.autoSelectId(),
  );

  const openConflicts = useLiveQuery((q) =>
    q
      .from({ conflict: conflictRecordsCollection })
      .where(({ conflict }) => eq(conflict.status, "open"))
      .select(({ conflict }) => ({ id: conflict.id })),
  );

  return (
    <div class="h-screen bg-slate-100 text-gray-900">
      <StatusBar
        session={props.session}
        openConflicts={openConflicts().length}
      />

      <main class="flex h-[calc(100vh-57px)]">
        <WorkOrderList
          session={props.session}
          data={workOrders}
          selectedId={effectiveSelectedId()}
          onSelect={props.onSelectOrder}
        />

        <div class="flex flex-1 flex-col gap-4 p-4">
          <WorkOrderDetail
            session={props.session}
            orderId={effectiveSelectedId()}
          />

          <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SyncActivityPanel />
            <ConflictInbox session={props.session} />
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Home() {
  const [selectedOrderId, setSelectedOrderId] = createSignal<
    string | undefined
  >(undefined);

  const [session] = createResource(clientSession, async (session) => {
    await ensureTanStackDbReady();
    return session;
  });

  return (
    <>
      <ErrorBoundary
        fallback={(error) => (
          <div class="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            Initialization failed: {error}
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
            {(session) => (
              <HomeContent
                session={session()}
                selectedOrderId={selectedOrderId()}
                onSelectOrder={setSelectedOrderId}
              />
            )}
          </Show>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}
