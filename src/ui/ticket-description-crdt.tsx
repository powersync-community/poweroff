import { createEffect, createSignal, onCleanup } from "solid-js";
import { ticketDescriptionUpdatesCollection } from "~/lib/tanstack-db";
import { TicketDescriptionYjsBridge } from "~/sync/ticket-description-yjs";

export function TicketDescriptionCrdt(props: {
  ticketId: () => string;
  userId: string;
  updates: () => any[];
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const [text, setText] = createSignal("");
  let bridge: TicketDescriptionYjsBridge | null = null;

  createEffect(() => {
    const ticketId = props.ticketId();

    if (bridge) {
      bridge.stop();
      bridge = null;
    }

    if (!ticketId) {
      setText("");
      return;
    }

    const nextBridge = new TicketDescriptionYjsBridge({
      ticketId,
      userId: props.userId,
      updatesCollection: ticketDescriptionUpdatesCollection,
      onTextChange(nextText) {
        setText(nextText);
      },
      onError(error) {
        console.error("[ticket-description-crdt] bridge error", error);
        props.onError("Failed to sync collaborative description");
      },
    });

    nextBridge.start();
    bridge = nextBridge;

    onCleanup(() => {
      nextBridge.stop();
      if (bridge === nextBridge) {
        bridge = null;
      }
    });
  });

  createEffect(() => {
    props.ticketId();
    bridge?.applyRemoteUpdates(props.updates());
  });

  return (
    <div>
      <label class="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Description (CRDT)
      </label>
      <textarea
        class="h-36 w-full rounded border border-gray-300 px-3 py-2 text-sm"
        value={text()}
        disabled={props.disabled}
        onInput={(event) => {
          const nextText = event.currentTarget.value;
          setText(nextText);
          bridge?.setTextFromTextarea(nextText);
        }}
      />
      <div class="mt-2 text-xs text-emerald-700">
        Auto-syncing Yjs updates to `ticket_description_update`.
      </div>
    </div>
  );
}
