import * as Y from "yjs";

type DescriptionUpdateRow = {
  id: string;
  ticket_id: string | null | undefined;
  update_b64: string | null | undefined;
  created_at?: string | null | undefined;
};

type DescriptionUpdateInsertCollection = {
  insert: (rows: Record<string, string> | Record<string, string>[]) => {
    isPersisted: { promise: Promise<unknown> };
  };
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

export class TicketDescriptionYjsBridge {
  private readonly remoteOrigin = Symbol("remote-yjs-origin");
  private readonly localOrigin = Symbol("local-yjs-origin");
  private readonly seenUpdateIds = new Set<string>();

  private doc: Y.Doc | null = null;
  private yText: Y.Text | null = null;
  private stopObserver: (() => void) | null = null;
  private started = false;

  constructor(
    private readonly params: {
      ticketId: string;
      userId: string;
      updatesCollection: DescriptionUpdateInsertCollection;
      onTextChange: (nextText: string) => void;
      onError?: (error: unknown) => void;
    },
  ) {}

  start() {
    if (this.started) return;
    this.started = true;
    this.doc = new Y.Doc();
    this.yText = this.doc.getText("ticket-description");

    console.log("[ticket-description-yjs] start", {
      ticketId: this.params.ticketId,
    });
    console.trace("[ticket-description-yjs] start trace", {
      ticketId: this.params.ticketId,
    });

    const onText = () => {
      this.params.onTextChange(this.yText?.toString() ?? "");
    };
    this.yText.observe(onText);
    this.stopObserver = () => {
      this.yText?.unobserve(onText);
    };

    this.doc.on("updateV2", this.handleLocalUpdate);
    this.params.onTextChange(this.yText.toString());
  }

  stop() {
    if (!this.started) return;
    this.started = false;

    console.log("[ticket-description-yjs] stop", {
      ticketId: this.params.ticketId,
      seenUpdates: this.seenUpdateIds.size,
    });

    this.doc?.off("updateV2", this.handleLocalUpdate);
    this.stopObserver?.();
    this.stopObserver = null;

    this.doc?.destroy();
    this.doc = null;
    this.yText = null;
    this.seenUpdateIds.clear();
  }

  applyRemoteUpdates(rows: DescriptionUpdateRow[]) {
    if (!this.doc) return;

    const updates = rows
      .filter(
        (row) =>
          row.ticket_id === this.params.ticketId &&
          !!row.id &&
          !!row.update_b64,
      )
      .sort((a, b) =>
        String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")),
      );

    for (const row of updates) {
      if (this.seenUpdateIds.has(row.id)) continue;

      try {
        Y.applyUpdateV2(
          this.doc,
          base64ToUint8Array(String(row.update_b64)),
          this.remoteOrigin,
        );
        this.seenUpdateIds.add(row.id);
      } catch (error) {
        console.error("[ticket-description-yjs] failed to apply remote", {
          ticketId: this.params.ticketId,
          updateId: row.id,
          error,
        });
        this.params.onError?.(error);
      }
    }
  }

  setTextFromTextarea(nextText: string) {
    if (!this.doc || !this.yText) return;

    const prevText = this.yText.toString();
    if (prevText === nextText) return;

    this.doc.transact(() => {
      this.yText!.delete(0, prevText.length);
      this.yText!.insert(0, nextText);
    }, this.localOrigin);
  }

  private handleLocalUpdate = async (update: Uint8Array, origin: unknown) => {
    if (origin === this.remoteOrigin) {
      return;
    }

    const updateId = crypto.randomUUID();
    this.seenUpdateIds.add(updateId);

    try {
      await this.params.updatesCollection.insert({
        id: updateId,
        ticket_id: this.params.ticketId,
        update_b64: uint8ArrayToBase64(update),
        created_by: this.params.userId,
        created_at: new Date().toISOString(),
      }).isPersisted.promise;
    } catch (error) {
      console.error("[ticket-description-yjs] failed to store local update", {
        ticketId: this.params.ticketId,
        updateId,
        error,
      });
      this.params.onError?.(error);
    }
  };
}

export const yjsBinary = {
  uint8ArrayToBase64,
  base64ToUint8Array,
};
