import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  TicketDescriptionYjsBridge,
  yjsBinary,
} from "~/sync/ticket-description-yjs";

describe("TicketDescriptionYjsBridge", () => {
  it("stores local textarea changes as updates", async () => {
    const inserted: Record<string, unknown>[] = [];
    const updatesCollection = {
      insert(rows: Record<string, unknown>[]) {
        inserted.push(...rows);
        return { isPersisted: { promise: Promise.resolve() } };
      },
    };

    let latestText = "";
    const bridge = new TicketDescriptionYjsBridge({
      ticketId: "ticket-1",
      userId: "u-1",
      updatesCollection,
      onTextChange(nextText) {
        latestText = nextText;
      },
    });

    bridge.start();
    bridge.setTextFromTextarea("hello yjs");
    await Promise.resolve();

    expect(latestText).toBe("hello yjs");
    expect(inserted).toHaveLength(1);
    expect(inserted[0].ticket_id).toBe("ticket-1");

    bridge.stop();
  });

  it("applies remote updates without echoing them", async () => {
    const inserted: Record<string, unknown>[] = [];
    const updatesCollection = {
      insert(rows: Record<string, unknown>[]) {
        inserted.push(...rows);
        return { isPersisted: { promise: Promise.resolve() } };
      },
    };

    let latestText = "";
    const bridge = new TicketDescriptionYjsBridge({
      ticketId: "ticket-1",
      userId: "u-1",
      updatesCollection,
      onTextChange(nextText) {
        latestText = nextText;
      },
    });
    bridge.start();

    const remoteDoc = new Y.Doc();
    remoteDoc.getText("ticket-description").insert(0, "remote-content");
    const remoteUpdate = Y.encodeStateAsUpdateV2(remoteDoc);

    bridge.applyRemoteUpdates([
      {
        id: "remote-1",
        ticket_id: "ticket-1",
        update_b64: yjsBinary.uint8ArrayToBase64(remoteUpdate),
        created_at: "2026-02-25T00:00:00.000Z",
      },
    ]);

    await Promise.resolve();
    expect(latestText).toBe("remote-content");
    expect(inserted).toHaveLength(0);

    bridge.stop();
  });
});
