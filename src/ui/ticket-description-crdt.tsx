import { createEffect, createSignal, onCleanup } from "solid-js";
import * as Y from "yjs";
import { ticketDescriptionUpdatesCollection } from "~/lib/tanstack-db";

type DescriptionUpdateRow = {
  id: string;
  ticket_id: string | null | undefined;
  update_b64: string | null | undefined;
  created_at?: string | null | undefined;
};

function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }

  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(base64, "base64"));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

export function TicketDescriptionCrdt(props: {
  ticketId: () => string;
  userId: string;
  updates: () => DescriptionUpdateRow[];
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const [text, setText] = createSignal("");
  const remoteOrigin = Symbol("remote-yjs-origin");
  const localOrigin = Symbol("local-yjs-origin");
  const seenUpdateIds = new Set<string>();

  let started = false;
  let activeTicketId: string | null = null;
  let doc: Y.Doc | null = null;
  let yText: Y.Text | null = null;
  let stopObserver: (() => void) | null = null;

  const handleLocalUpdate = async (update: Uint8Array, origin: unknown) => {
    if (origin === remoteOrigin || !activeTicketId) {
      return;
    }

    const updateId = crypto.randomUUID();
    seenUpdateIds.add(updateId);

    try {
      await ticketDescriptionUpdatesCollection.insert({
        id: updateId,
        ticket_id: activeTicketId,
        update_b64: uint8ArrayToBase64(update),
        created_by: props.userId,
        created_at: new Date().toISOString(),
      }).isPersisted.promise;
    } catch (error) {
      console.error("[ticket-description-crdt] failed to store local update", {
        ticketId: activeTicketId,
        updateId,
        error,
      });
      props.onError("Failed to sync collaborative description");
    }
  };

  const stopBridge = () => {
    if (!started) return;
    started = false;

    console.log("[ticket-description-crdt] stop", {
      ticketId: activeTicketId,
      seenUpdates: seenUpdateIds.size,
    });

    doc?.off("updateV2", handleLocalUpdate);
    stopObserver?.();
    stopObserver = null;

    doc?.destroy();
    doc = null;
    yText = null;
    activeTicketId = null;
    seenUpdateIds.clear();
  };

  const startBridge = (ticketId: string) => {
    if (started) return;
    started = true;
    activeTicketId = ticketId;
    doc = new Y.Doc();
    yText = doc.getText("ticket-description");

    console.log("[ticket-description-crdt] start", { ticketId });
    console.trace("[ticket-description-crdt] start trace", { ticketId });

    const onText = () => {
      setText(yText?.toString() ?? "");
    };
    yText.observe(onText);
    stopObserver = () => {
      yText?.unobserve(onText);
    };

    doc.on("updateV2", handleLocalUpdate);
    setText(yText.toString());
  };

  const applyRemoteUpdates = (rows: DescriptionUpdateRow[]) => {
    if (!doc || !activeTicketId) return;

    const updates = rows
      .filter(
        (row) =>
          row.ticket_id === activeTicketId && !!row.id && !!row.update_b64,
      )
      .sort((a, b) =>
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
      );

    for (const row of updates) {
      if (seenUpdateIds.has(row.id)) continue;

      try {
        Y.applyUpdateV2(
          doc,
          base64ToUint8Array(String(row.update_b64)),
          remoteOrigin,
        );
        seenUpdateIds.add(row.id);
      } catch (error) {
        console.error("[ticket-description-crdt] failed to apply remote", {
          ticketId: activeTicketId,
          updateId: row.id,
          error,
        });
        props.onError("Failed to sync collaborative description");
      }
    }
  };

  const setTextFromTextarea = (nextText: string) => {
    if (!doc || !yText) return;

    const prevText = yText.toString();
    if (prevText === nextText) return;

    doc.transact(() => {
      yText!.delete(0, prevText.length);
      yText!.insert(0, nextText);
    }, localOrigin);
  };

  createEffect(() => {
    const ticketId = props.ticketId();

    stopBridge();

    if (!ticketId) {
      setText("");
      return;
    }

    startBridge(ticketId);

    onCleanup(() => {
      stopBridge();
    });
  });

  createEffect(() => {
    props.ticketId();
    applyRemoteUpdates(props.updates());
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
          setTextFromTextarea(nextText);
        }}
      />
      <div class="mt-2 text-xs text-emerald-700">
        Auto-syncing Yjs updates to `ticket_description_update`.
      </div>
    </div>
  );
}
