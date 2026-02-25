import { A } from "@solidjs/router";
import { For, Show, createEffect, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { resolveConflict } from "~/server/powersync";
import { STRATEGY_ROUTES, type DemoStrategyId } from "~/domain/strategy";
import {
  useOpenTicketConflicts,
  useTicketActivities,
  useTicketAssignments,
  useTicketAttachmentUrls,
  useTicketComments,
  useTicketDescriptionUpdates,
  useTicketLinks,
  useTicketList,
  useTicketUsers,
} from "~/data/client/queries";
import type { DemoSession } from "~/lib/session";
import {
  ticketAssignmentsCollection,
  ticketAttachmentUrlsCollection,
  ticketCommentsCollection,
  ticketLinksCollection,
  ticketsCollection,
} from "~/lib/tanstack-db";
import { isSyncPaused, toggleSyncPaused } from "~/sync/control";
import { SyncActivityPanel } from "~/ui/sync-activity-panel";
import { getDemoUserName } from "~/lib/demo-users";
import { TicketDescriptionCrdt } from "~/ui/ticket-description-crdt";

function parseConflictValue(raw: unknown): string {
  if (raw == null) return "";

  if (typeof raw === "object" && raw !== null && "value" in raw) {
    return String((raw as { value?: unknown }).value ?? "");
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "value" in parsed) {
        return String((parsed as { value?: unknown }).value ?? "");
      }
    } catch {
      return raw;
    }
  }

  return String(raw);
}

function hashUrl(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }

  return `u${Math.abs(hash)}`;
}

function strategyDescription(strategy: DemoStrategyId) {
  if (strategy === "lww") {
    return "Title, description, and status writes are applied in receive order.";
  }

  if (strategy === "restricted") {
    return "Potentially destructive ticket edits are disabled while offline.";
  }

  if (strategy === "audit-log") {
    return "Accepted writes append audit rows in ticket_activity.";
  }

  if (strategy === "domain-resolution") {
    return "Domain rule: once status reaches done, stale reopen attempts are ignored.";
  }

  if (strategy === "manual-resolution") {
    return "Version-mismatched title edits create manual conflicts that require resolution.";
  }

  return "Description is collaboratively edited via Yjs deltas.";
}

export function DemoScreen(props: {
  strategy: DemoStrategyId;
  session: DemoSession;
  selectedTicketId?: string;
  onSelectTicket: (id: string) => void;
}) {
  const ticketList = useTicketList();
  const users = useTicketUsers();

  const effectiveTicketId = createMemo(
    () => props.selectedTicketId ?? ticketList.autoSelectTicketId(),
  );

  const currentTicket = createMemo(() =>
    ticketList
      .visibleTickets()
      .find((ticket) => ticket.id === effectiveTicketId()),
  );

  const assignments = useTicketAssignments(effectiveTicketId);
  const comments = useTicketComments(effectiveTicketId);
  const attachments = useTicketAttachmentUrls(effectiveTicketId);
  const links = useTicketLinks(effectiveTicketId);
  const activities = useTicketActivities(effectiveTicketId);
  const conflicts = useOpenTicketConflicts();
  const descriptionUpdates = useTicketDescriptionUpdates(effectiveTicketId);

  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const [customConflictValues, setCustomConflictValues] = createStore<
    Record<string, string>
  >({});

  const [draft, setDraft] = createStore({
    ticketId: "",
    title: "",
    description: "",
    status: "pending",
    newTicketTitle: "",
    newTicketDescription: "",
    assigneeId: "",
    newComment: "",
    newAttachmentUrl: "",
    newLinkUrl: "",
  });

  createEffect(() => {
    const ticket = currentTicket();
    if (!ticket) return;
    if (draft.ticketId === ticket.id) return;

    setDraft({
      ticketId: ticket.id,
      title: String(ticket.title ?? ""),
      description: String(ticket.description ?? ""),
      status: String(ticket.status ?? "pending"),
      assigneeId: users()[0]?.id ?? "",
    });
  });

  const selectedUserIds = createMemo(
    () => new Set(assignments().map((assignment) => assignment.user_id)),
  );

  const candidateAssignees = createMemo(() =>
    users().filter((user) => !selectedUserIds().has(user.id)),
  );

  createEffect(() => {
    const options = candidateAssignees();
    if (!options.length) return;
    if (options.some((user) => user.id === draft.assigneeId)) return;
    setDraft("assigneeId", options[0].id);
  });

  const destructiveDisabled = createMemo(
    () => props.strategy === "restricted" && isSyncPaused(),
  );

  const runLocalMutation = async (
    label: string,
    action: () => Promise<void>,
  ) => {
    setSaving(true);
    setError("");

    try {
      await action();
      console.log("[demo-screen] mutation complete", { label });
    } catch (err: any) {
      console.error(`[demo-screen] mutation failed: ${label}`, err);
      setError(err?.message ?? `Failed to ${label}`);
    } finally {
      setSaving(false);
    }
  };

  const createTicket = async () => {
    const title = draft.newTicketTitle.trim();
    if (!title) {
      setError("Ticket title is required");
      return;
    }

    await runLocalMutation("create ticket", async () => {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await ticketsCollection.insert({
        id,
        title,
        description: draft.newTicketDescription,
        status: "pending",
        deleted_at: null,
        created_at: now,
        updated_at: now,
        version: 0,
      }).isPersisted.promise;

      setDraft("newTicketTitle", "");
      setDraft("newTicketDescription", "");
      props.onSelectTicket(id);
    });
  };

  const saveTicketFields = async () => {
    const ticket = currentTicket();
    if (!ticket) return;

    if (destructiveDisabled()) {
      setError(
        "Destructive ticket edits are disabled while offline in this strategy",
      );
      return;
    }

    await runLocalMutation("save ticket fields", async () => {
      await ticketsCollection.update(ticket.id, (row) => {
        row.title = draft.title.trim() || row.title;
        row.description = draft.description;
        row.status = draft.status;
        row.version = Number(ticket.version ?? 0);
        row.updated_at = new Date().toISOString();
      }).isPersisted.promise;
    });
  };

  const addAssignment = async () => {
    const ticketId = effectiveTicketId();
    if (!ticketId || !draft.assigneeId) return;

    await runLocalMutation("add assignment", async () => {
      await ticketAssignmentsCollection.insert({
        id: crypto.randomUUID(),
        ticket_id: ticketId,
        user_id: draft.assigneeId,
        deleted_at: null,
        created_at: new Date().toISOString(),
      }).isPersisted.promise;
    });
  };

  const removeAssignment = async (id: string) => {
    await runLocalMutation("remove assignment", async () => {
      await ticketAssignmentsCollection.delete(id).isPersisted.promise;
    });
  };

  const addComment = async () => {
    const ticketId = effectiveTicketId();
    const body = draft.newComment.trim();
    if (!ticketId || !body) return;

    await runLocalMutation("add comment", async () => {
      await ticketCommentsCollection.insert({
        id: crypto.randomUUID(),
        ticket_id: ticketId,
        body,
        created_by: props.session.userId,
        deleted_at: null,
        created_at: new Date().toISOString(),
      }).isPersisted.promise;

      setDraft("newComment", "");
    });
  };

  const removeComment = async (id: string) => {
    await runLocalMutation("remove comment", async () => {
      await ticketCommentsCollection.delete(id).isPersisted.promise;
    });
  };

  const addAttachmentUrl = async () => {
    const ticketId = effectiveTicketId();
    const url = draft.newAttachmentUrl.trim();
    if (!ticketId || !url) return;

    await runLocalMutation("add attachment URL", async () => {
      await ticketAttachmentUrlsCollection.insert({
        id: crypto.randomUUID(),
        ticket_id: ticketId,
        url,
        url_hash: hashUrl(url),
        created_by: props.session.userId,
        deleted_at: null,
        created_at: new Date().toISOString(),
      }).isPersisted.promise;

      setDraft("newAttachmentUrl", "");
    });
  };

  const removeAttachmentUrl = async (id: string) => {
    await runLocalMutation("remove attachment URL", async () => {
      await ticketAttachmentUrlsCollection.delete(id).isPersisted.promise;
    });
  };

  const addLink = async () => {
    const ticketId = effectiveTicketId();
    const url = draft.newLinkUrl.trim();
    if (!ticketId || !url) return;

    await runLocalMutation("add link", async () => {
      await ticketLinksCollection.insert({
        id: crypto.randomUUID(),
        ticket_id: ticketId,
        url,
        created_by: props.session.userId,
        deleted_at: null,
        created_at: new Date().toISOString(),
      }).isPersisted.promise;

      setDraft("newLinkUrl", "");
    });
  };

  const removeLink = async (id: string) => {
    await runLocalMutation("remove link", async () => {
      await ticketLinksCollection.delete(id).isPersisted.promise;
    });
  };

  const resolveManualConflict = async (
    conflictId: string,
    strategy: "local" | "server" | "custom",
  ) => {
    setSaving(true);
    setError("");

    try {
      await resolveConflict(
        conflictId,
        strategy,
        customConflictValues[conflictId],
      );
      console.log("[demo-screen] resolved conflict", { conflictId, strategy });
    } catch (err: any) {
      setError(err?.message ?? "Failed to resolve conflict");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="h-screen bg-slate-100 text-gray-900">
      <header class="border-b border-gray-200 bg-white px-4 py-3">
        <div class="flex flex-wrap items-start gap-3">
          <div>
            <h1 class="text-base font-semibold text-gray-900">
              Offline Ticket Demo
            </h1>
            <p class="text-xs text-gray-600">
              {strategyDescription(props.strategy)}
            </p>
          </div>

          <div class="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span class="rounded bg-gray-100 px-2 py-1 text-gray-700">
              User: {props.session.userName}
            </span>
            <button
              class={`rounded px-3 py-1 font-semibold ${
                isSyncPaused()
                  ? "bg-amber-600 text-white"
                  : "bg-emerald-700 text-white"
              }`}
              onClick={toggleSyncPaused}
            >
              {isSyncPaused() ? "Offline (Reconnect)" : "Online (Go Offline)"}
            </button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-2">
          <For each={STRATEGY_ROUTES}>
            {(route) => (
              <A
                href={route.href}
                class={`rounded border px-2 py-1 text-xs ${
                  route.id === props.strategy
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-gray-300 bg-white text-gray-700"
                }`}
              >
                {route.title}
              </A>
            )}
          </For>
        </div>
      </header>

      <main class="flex h-[calc(100vh-97px)] overflow-hidden">
        <aside class="w-80 border-r border-gray-200 bg-white">
          <div class="border-b border-gray-100 p-3">
            <div class="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Create Ticket
            </div>
            <input
              class="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Title"
              value={draft.newTicketTitle}
              onInput={(event) =>
                setDraft("newTicketTitle", event.currentTarget.value)
              }
            />
            <textarea
              class="mt-2 h-20 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Description"
              value={draft.newTicketDescription}
              onInput={(event) =>
                setDraft("newTicketDescription", event.currentTarget.value)
              }
            />
            <button
              class="mt-2 rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
              disabled={saving()}
              onClick={createTicket}
            >
              Create
            </button>
          </div>

          <div class="max-h-[calc(100vh-16rem)] overflow-y-auto p-2">
            <For each={ticketList.visibleTickets()}>
              {(ticket) => (
                <button
                  class={`mb-2 w-full rounded border px-3 py-2 text-left ${
                    ticket.id === effectiveTicketId()
                      ? "border-blue-400 bg-blue-50"
                      : "border-gray-200 bg-white hover:bg-gray-50"
                  }`}
                  onClick={() => props.onSelectTicket(ticket.id)}
                >
                  <div class="text-sm font-medium text-gray-900">
                    {ticket.title}
                  </div>
                  <div class="mt-1 text-xs text-gray-600">{ticket.status}</div>
                </button>
              )}
            </For>
          </div>
        </aside>

        <section class="flex-1 overflow-y-auto p-4">
          <Show
            when={currentTicket()}
            fallback={
              <div class="rounded border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
                Select a ticket.
              </div>
            }
          >
            {(ticket) => (
              <div class="space-y-4">
                <section class="rounded border border-gray-200 bg-white p-4">
                  <h2 class="mb-3 text-base font-semibold">Ticket Detail</h2>

                  <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Title
                  </label>
                  <input
                    class="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    value={draft.title}
                    disabled={destructiveDisabled() || saving()}
                    onInput={(event) =>
                      setDraft("title", event.currentTarget.value)
                    }
                  />

                  <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </label>
                  <select
                    class="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    value={draft.status}
                    disabled={destructiveDisabled() || saving()}
                    onChange={(event) =>
                      setDraft("status", event.currentTarget.value)
                    }
                  >
                    <option value="pending">pending</option>
                    <option value="in_progress">in_progress</option>
                    <option value="done">done</option>
                  </select>

                  <Show
                    when={props.strategy === "crdt"}
                    fallback={
                      <>
                        <label class="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Description
                        </label>
                        <textarea
                          class="h-36 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                          value={draft.description}
                          disabled={destructiveDisabled() || saving()}
                          onInput={(event) =>
                            setDraft("description", event.currentTarget.value)
                          }
                        />
                      </>
                    }
                  >
                    <TicketDescriptionCrdt
                      ticketId={() => ticket().id}
                      userId={props.session.userId}
                      updates={descriptionUpdates}
                      disabled={saving()}
                      onError={(message) => setError(message)}
                    />
                  </Show>

                  <div class="mt-3 flex items-center gap-2">
                    <button
                      class="rounded bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                      disabled={saving() || props.strategy === "crdt"}
                      onClick={saveTicketFields}
                    >
                      Save Fields
                    </button>
                    <Show when={destructiveDisabled()}>
                      <span class="text-xs text-amber-700">
                        Restricted strategy: edits disabled while offline.
                      </span>
                    </Show>
                  </div>
                </section>

                <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div class="rounded border border-gray-200 bg-white p-4">
                    <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Assignees
                    </h3>
                    <div class="mb-2 flex gap-2">
                      <select
                        class="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        value={draft.assigneeId}
                        onChange={(event) =>
                          setDraft("assigneeId", event.currentTarget.value)
                        }
                      >
                        <For each={candidateAssignees()}>
                          {(user) => (
                            <option value={user.id}>{user.name}</option>
                          )}
                        </For>
                      </select>
                      <button
                        class="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                        disabled={saving() || !candidateAssignees().length}
                        onClick={addAssignment}
                      >
                        Add
                      </button>
                    </div>
                    <div class="space-y-1 text-sm">
                      <For each={assignments()}>
                        {(assignment) => (
                          <div class="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-2 py-1">
                            <span>{getDemoUserName(assignment.user_id)}</span>
                            <button
                              class="text-xs text-red-700"
                              disabled={saving()}
                              onClick={() => removeAssignment(assignment.id)}
                            >
                              remove
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  <div class="rounded border border-gray-200 bg-white p-4">
                    <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Comments
                    </h3>
                    <div class="mb-2 flex gap-2">
                      <input
                        class="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder="Add comment"
                        value={draft.newComment}
                        onInput={(event) =>
                          setDraft("newComment", event.currentTarget.value)
                        }
                      />
                      <button
                        class="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                        disabled={saving()}
                        onClick={addComment}
                      >
                        Add
                      </button>
                    </div>
                    <div class="space-y-1 text-sm">
                      <For each={comments()}>
                        {(comment) => (
                          <div class="rounded border border-gray-100 bg-gray-50 px-2 py-1">
                            <div>{comment.body}</div>
                            <div class="mt-1 flex items-center justify-between text-xs text-gray-500">
                              <span>{getDemoUserName(comment.created_by)}</span>
                              <button
                                class="text-red-700"
                                disabled={saving()}
                                onClick={() => removeComment(comment.id)}
                              >
                                remove
                              </button>
                            </div>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  <div class="rounded border border-gray-200 bg-white p-4">
                    <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Attachment URLs
                    </h3>
                    <div class="mb-2 flex gap-2">
                      <input
                        class="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder="https://..."
                        value={draft.newAttachmentUrl}
                        onInput={(event) =>
                          setDraft(
                            "newAttachmentUrl",
                            event.currentTarget.value,
                          )
                        }
                      />
                      <button
                        class="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                        disabled={saving()}
                        onClick={addAttachmentUrl}
                      >
                        Add
                      </button>
                    </div>
                    <div class="space-y-1 text-xs">
                      <For each={attachments()}>
                        {(attachment) => (
                          <div class="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-2 py-1">
                            <a
                              href={attachment.url}
                              class="max-w-[220px] truncate text-blue-700 underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {attachment.url}
                            </a>
                            <button
                              class="text-red-700"
                              disabled={saving()}
                              onClick={() => removeAttachmentUrl(attachment.id)}
                            >
                              remove
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>

                  <div class="rounded border border-gray-200 bg-white p-4">
                    <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Links
                    </h3>
                    <div class="mb-2 flex gap-2">
                      <input
                        class="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        placeholder="https://..."
                        value={draft.newLinkUrl}
                        onInput={(event) =>
                          setDraft("newLinkUrl", event.currentTarget.value)
                        }
                      />
                      <button
                        class="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
                        disabled={saving()}
                        onClick={addLink}
                      >
                        Add
                      </button>
                    </div>
                    <div class="space-y-1 text-xs">
                      <For each={links()}>
                        {(link) => (
                          <div class="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-2 py-1">
                            <a
                              href={link.url}
                              class="max-w-[220px] truncate text-blue-700 underline"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {link.url}
                            </a>
                            <button
                              class="text-red-700"
                              disabled={saving()}
                              onClick={() => removeLink(link.id)}
                            >
                              remove
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                </section>

                <section class="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <SyncActivityPanel />

                  <Show when={props.strategy === "audit-log"}>
                    <section class="rounded border border-gray-200 bg-white p-4">
                      <h3 class="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                        Ticket Activity Log
                      </h3>
                      <div class="max-h-64 space-y-2 overflow-y-auto">
                        <For each={activities()}>
                          {(item) => (
                            <div class="rounded border border-gray-100 bg-gray-50 px-2 py-1 text-xs text-gray-700">
                              <div class="font-medium">{item.action}</div>
                              <div>
                                {item.field_name ?? "-"} •{" "}
                                {String(item.created_at ?? "")}
                              </div>
                              <Show when={item.details}>
                                <pre class="mt-1 whitespace-pre-wrap text-[11px] text-gray-600">
                                  {String(item.details)}
                                </pre>
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </section>
                  </Show>

                  <Show when={props.strategy === "manual-resolution"}>
                    <section class="rounded border border-gray-200 bg-white p-4">
                      <div class="mb-2 flex items-center justify-between">
                        <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-500">
                          Conflict Inbox
                        </h3>
                        <span class="text-xs text-gray-500">
                          {conflicts().length} open
                        </span>
                      </div>

                      <div class="max-h-64 space-y-2 overflow-y-auto">
                        <For each={conflicts()}>
                          {(conflict) => (
                            <div class="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                              <div class="font-semibold">
                                {conflict.field_name} on ticket{" "}
                                {conflict.ticket_id}
                              </div>
                              <div class="mt-1">
                                Local:{" "}
                                {parseConflictValue(conflict.local_value)}
                              </div>
                              <div>
                                Server:{" "}
                                {parseConflictValue(conflict.server_value)}
                              </div>
                              <input
                                class="mt-2 w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                                placeholder="Custom value"
                                value={customConflictValues[conflict.id] ?? ""}
                                onInput={(event) =>
                                  setCustomConflictValues(
                                    conflict.id,
                                    event.currentTarget.value,
                                  )
                                }
                              />
                              <div class="mt-2 flex flex-wrap gap-2">
                                <button
                                  class="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white"
                                  disabled={saving()}
                                  onClick={() =>
                                    resolveManualConflict(conflict.id, "local")
                                  }
                                >
                                  Keep Local
                                </button>
                                <button
                                  class="rounded bg-slate-700 px-2 py-1 text-[11px] font-semibold text-white"
                                  disabled={saving()}
                                  onClick={() =>
                                    resolveManualConflict(conflict.id, "server")
                                  }
                                >
                                  Keep Server
                                </button>
                                <button
                                  class="rounded bg-slate-500 px-2 py-1 text-[11px] font-semibold text-white"
                                  disabled={saving()}
                                  onClick={() =>
                                    resolveManualConflict(conflict.id, "custom")
                                  }
                                >
                                  Use Custom
                                </button>
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </section>
                  </Show>
                </section>

                <Show when={error()}>
                  <div class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error()}
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </section>
      </main>
    </div>
  );
}
