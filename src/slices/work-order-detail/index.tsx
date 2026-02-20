import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { eq, useLiveQuery } from "@tanstack/solid-db";
import {
  ensureTanStackDbReady,
  workOrderNotesCollection,
  workOrdersCollection,
  partUsageEventsCollection,
} from "~/lib/tanstack-db";
import { queueLocalOperation } from "~/lib/sync-activity";
import type { DemoSession } from "~/lib/session";

type WorkOrderRow = {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  status: "open" | "in_progress" | "closed";
  site_contact_phone: string | null;
  version: number;
  updated_at: string;
};

type NoteRow = {
  id: string;
  work_order_id: string;
  crdt_payload: string;
  updated_by: string;
  updated_at: string;
};

function decodeByteaText(value: string | null | undefined) {
  if (!value) return "";
  if (value.startsWith("\\x")) {
    const hex = value.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  }
  return value;
}

export function WorkOrderDetail(props: {
  session: DemoSession;
  orderId?: string;
}) {
  const selectedId = createMemo(() => props.orderId ?? "");

  const workOrderQuery = useLiveQuery((q) =>
    q
      .from({ workOrder: workOrdersCollection })
      .where(({ workOrder }) => eq(workOrder.id, selectedId()))
      .select(({ workOrder }) => ({
        id: workOrder.id,
        title: workOrder.title,
        priority: workOrder.priority,
        status: workOrder.status,
        site_contact_phone: workOrder.site_contact_phone,
        version: workOrder.version,
        updated_at: workOrder.updated_at,
      })),
  );

  const noteQuery = useLiveQuery((q) =>
    q
      .from({ note: workOrderNotesCollection })
      .where(({ note }) => eq(note.work_order_id, selectedId()))
      .select(({ note }) => ({
        id: note.id,
        work_order_id: note.work_order_id,
        crdt_payload: note.crdt_payload,
        updated_by: note.updated_by,
        updated_at: note.updated_at,
      })),
  );

  const currentOrder = createMemo(
    () => (workOrderQuery()[0] as WorkOrderRow | undefined) ?? undefined,
  );
  const currentNote = createMemo(
    () => (noteQuery()[0] as NoteRow | undefined) ?? undefined,
  );

  type DraftState = {
    orderId: string;
    title: string;
    priority: "low" | "medium" | "high";
    phone: string;
    noteText: string;
  };

  const [draft, setDraft] = createStore<DraftState>({
    orderId: "",
    title: "",
    priority: "low",
    phone: "",
    noteText: "",
  });

  createEffect(() => {
    const id = selectedId();
    if (!id) {
      if (draft.orderId) {
        setDraft({
          orderId: "",
          title: "",
          priority: "low",
          phone: "",
          noteText: "",
        });
      }
      return;
    }

    if (draft.orderId === id) return;

    const order = currentOrder();
    if (!order || order.id !== id) return;

    const note = currentNote();
    const isNoteMatch = note?.work_order_id === id;

    setDraft({
      orderId: id,
      title: order.title ?? "",
      priority: order.priority as DraftState["priority"],
      phone: order.site_contact_phone ?? "",
      noteText: isNoteMatch ? decodeByteaText(note?.crdt_payload) : "",
    });
  });

  const [partSku, setPartSku] = createSignal("MOTOR-1HP");
  const [qtyDelta, setQtyDelta] = createSignal(1);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  const runLocalMutation = async (
    label: string,
    action: () => Promise<void>,
  ) => {
    setSaving(true);
    setError("");
    try {
      await ensureTanStackDbReady();
      queueLocalOperation(1);
      await action();
    } catch (err: any) {
      console.error(`[work-order-detail] ${label} failed`, err);
      setError(err?.message ?? `Failed to ${label}`);
    } finally {
      setSaving(false);
    }
  };

  const saveMainFields = async () => {
    const order = currentOrder();
    if (!order) return;

    const nextUpdatedAt = new Date().toISOString();
    const nextTitle = draft.title.trim() || order.title;
    const nextPriority = draft.priority;
    const nextPhone = draft.phone.trim();

    await runLocalMutation("save fields", async () => {
      console.log("[work-order-detail] save fields", {
        id: order.id,
        title: nextTitle,
        priority: nextPriority,
        site_contact_phone: nextPhone || null,
        updated_at: nextUpdatedAt,
        version: Number(order.version),
        existingKeys: Object.keys(order),
      });
      await workOrdersCollection.update(order.id, (row: any) => {
        row.title = nextTitle;
        row.priority = nextPriority;
        row.site_contact_phone = nextPhone || null;
        row.updated_at = nextUpdatedAt;
        row.version = Number(order.version);
      }).isPersisted.promise;
    });
  };

  const saveNote = async () => {
    const order = currentOrder();
    if (!order) return;

    await runLocalMutation("save note", async () => {
      const existingNote = currentNote();
      if (existingNote) {
        await workOrderNotesCollection.update(existingNote.id, (row: any) => {
          row.crdt_payload = draft.noteText;
          row.updated_by = props.session.userId;
          row.updated_at = new Date().toISOString();
        }).isPersisted.promise;
      } else {
        await workOrderNotesCollection.insert({
          id: crypto.randomUUID(),
          work_order_id: order.id,
          crdt_payload: draft.noteText,
          updated_by: props.session.userId,
          updated_at: new Date().toISOString(),
        }).isPersisted.promise;
      }
    });
  };

  const addPartEvent = async () => {
    const order = currentOrder();
    if (!order) return;

    await runLocalMutation("add part event", async () => {
      await partUsageEventsCollection.insert({
        id: crypto.randomUUID(),
        work_order_id: order.id,
        part_sku: partSku().trim(),
        qty_delta: Number(qtyDelta()),
        created_by: props.session.userId,
        created_at: new Date().toISOString(),
      }).isPersisted.promise;
    });
  };

  const attemptStatusChange = async (
    nextStatus: "open" | "in_progress" | "closed",
  ) => {
    const order = currentOrder();
    if (!order) return;

    await runLocalMutation("change status", async () => {
      await workOrdersCollection.update(order.id, (row: any) => {
        row.status = nextStatus;
        row.updated_at = new Date().toISOString();
        row.version = Number(order.version);
      }).isPersisted.promise;
    });
  };

  const attemptDelete = async () => {
    const order = currentOrder();
    if (!order) return;

    await runLocalMutation("delete work order", async () => {
      await workOrdersCollection.delete(order.id).isPersisted.promise;
    });
  };

  return (
    <section class="flex-1 bg-slate-50 p-4">
      <Show
        when={currentOrder()}
        fallback={
          <div class="rounded border border-dashed border-gray-300 bg-white p-6 text-gray-500">
            Select a work order.
          </div>
        }
      >
        {(order) => (
          <div class="space-y-4">
            <div class="rounded border border-gray-200 bg-white p-4">
              <h2 class="mb-4 text-lg font-semibold text-gray-900">
                Work Order Detail
              </h2>

              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Title
              </label>
              <input
                class="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={draft.title}
                onInput={(e) => {
                  setDraft("title", e.currentTarget.value);
                }}
              />

              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Priority
              </label>
              <select
                class="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={draft.priority}
                onChange={(e) => {
                  setDraft(
                    "priority",
                    e.currentTarget.value as DraftState["priority"],
                  );
                }}
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>

              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Site Contact Phone
              </label>
              <input
                class="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={draft.phone}
                onInput={(e) => {
                  setDraft("phone", e.currentTarget.value);
                }}
              />

              <div class="mb-3 rounded bg-gray-50 p-2 text-xs text-gray-600">
                Current status: <strong>{order().status}</strong>
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  class="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                  disabled={saving()}
                  onClick={saveMainFields}
                >
                  Save Fields
                </button>
                <button
                  class="rounded bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-300"
                  disabled={saving()}
                  onClick={() => attemptStatusChange("closed")}
                >
                  Attempt Close
                </button>
                <button
                  class="rounded bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-300"
                  disabled={saving()}
                  onClick={() => attemptStatusChange("open")}
                >
                  Attempt Reopen
                </button>
                <button
                  class="rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                  disabled={saving()}
                  onClick={attemptDelete}
                >
                  Attempt Delete
                </button>
              </div>
            </div>

            <div class="rounded border border-gray-200 bg-white p-4">
              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Notes{" "}
                <span class="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-800">
                  CRDT
                </span>
              </label>
              <textarea
                class="h-28 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                value={draft.noteText}
                onInput={(e) => {
                  setDraft("noteText", e.currentTarget.value);
                }}
              />
              <button
                class="mt-2 rounded bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                disabled={saving()}
                onClick={saveNote}
              >
                Save Note
              </button>
            </div>

            <div class="rounded border border-gray-200 bg-white p-4">
              <label class="mb-2 block text-xs font-semibold text-gray-500">
                Part Usage{" "}
                <span class="ml-1 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] text-cyan-800">
                  DOMAIN
                </span>
              </label>
              <div class="flex flex-wrap gap-2">
                <input
                  class="rounded border border-gray-300 px-3 py-2 text-sm"
                  value={partSku()}
                  onInput={(e) => setPartSku(e.currentTarget.value)}
                />
                <input
                  class="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                  type="number"
                  value={qtyDelta()}
                  onInput={(e) => setQtyDelta(Number(e.currentTarget.value))}
                />
                <button
                  class="rounded bg-cyan-700 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-600"
                  disabled={saving()}
                  onClick={addPartEvent}
                >
                  Add Event
                </button>
              </div>

              <div class="mt-3 space-y-1 text-xs text-gray-600">
                Events are recorded as domain operations. See Sync Activity for
                results.
              </div>
            </div>

            <Show when={error()}>
              <div class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error()}
              </div>
            </Show>
          </div>
        )}
      </Show>
    </section>
  );
}
