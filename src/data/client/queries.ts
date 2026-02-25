import { createMemo } from "solid-js";
import { eq, useLiveQuery } from "@tanstack/solid-db";
import {
  appUsersCollection,
  ticketActivitiesCollection,
  ticketAssignmentsCollection,
  ticketAttachmentUrlsCollection,
  ticketCommentsCollection,
  ticketConflictsCollection,
  ticketDescriptionUpdatesCollection,
  ticketLinksCollection,
  ticketsCollection,
} from "~/lib/tanstack-db";

export function useTicketList() {
  const ticketsQuery = useLiveQuery((q) =>
    q
      .from({ ticket: ticketsCollection })
      .orderBy(({ ticket }) => ticket.updated_at, "desc")
      .select(({ ticket }) => ({
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        status: ticket.status,
        deleted_at: ticket.deleted_at,
        updated_at: ticket.updated_at,
        version: ticket.version,
      })),
  );

  const visibleTickets = createMemo(() =>
    (ticketsQuery() as any[]).filter((ticket) => !ticket.deleted_at),
  );

  const autoSelectTicketId = createMemo(
    () => visibleTickets()[0]?.id as string,
  );

  return {
    visibleTickets,
    autoSelectTicketId,
  };
}

export function useTicketUsers() {
  const usersQuery = useLiveQuery((q) =>
    q.from({ user: appUsersCollection }).select(({ user }) => ({
      id: user.id,
      name: user.name,
    })),
  );

  return usersQuery;
}

export function useTicketAssignments(ticketId: () => string) {
  const assignmentsQuery = useLiveQuery((q) =>
    q
      .from({ assignment: ticketAssignmentsCollection })
      .where(({ assignment }) => eq(assignment.ticket_id, ticketId()))
      .orderBy(({ assignment }) => assignment.created_at, "desc")
      .select(({ assignment }) => ({
        id: assignment.id,
        ticket_id: assignment.ticket_id,
        user_id: assignment.user_id,
        deleted_at: assignment.deleted_at,
      })),
  );

  return createMemo(() =>
    (assignmentsQuery() as any[]).filter(
      (assignment) => !assignment.deleted_at,
    ),
  );
}

export function useTicketComments(ticketId: () => string) {
  const commentsQuery = useLiveQuery((q) =>
    q
      .from({ comment: ticketCommentsCollection })
      .where(({ comment }) => eq(comment.ticket_id, ticketId()))
      .orderBy(({ comment }) => comment.created_at, "desc")
      .select(({ comment }) => ({
        id: comment.id,
        ticket_id: comment.ticket_id,
        body: comment.body,
        created_by: comment.created_by,
        deleted_at: comment.deleted_at,
        created_at: comment.created_at,
      })),
  );

  return createMemo(() =>
    (commentsQuery() as any[]).filter((comment) => !comment.deleted_at),
  );
}

export function useTicketAttachmentUrls(ticketId: () => string) {
  const attachmentsQuery = useLiveQuery((q) =>
    q
      .from({ attachment: ticketAttachmentUrlsCollection })
      .where(({ attachment }) => eq(attachment.ticket_id, ticketId()))
      .orderBy(({ attachment }) => attachment.created_at, "desc")
      .select(({ attachment }) => ({
        id: attachment.id,
        ticket_id: attachment.ticket_id,
        url: attachment.url,
        created_by: attachment.created_by,
        deleted_at: attachment.deleted_at,
        created_at: attachment.created_at,
      })),
  );

  return createMemo(() =>
    (attachmentsQuery() as any[]).filter(
      (attachment) => !attachment.deleted_at,
    ),
  );
}

export function useTicketLinks(ticketId: () => string) {
  const linksQuery = useLiveQuery((q) =>
    q
      .from({ link: ticketLinksCollection })
      .where(({ link }) => eq(link.ticket_id, ticketId()))
      .orderBy(({ link }) => link.created_at, "desc")
      .select(({ link }) => ({
        id: link.id,
        ticket_id: link.ticket_id,
        url: link.url,
        created_by: link.created_by,
        deleted_at: link.deleted_at,
        created_at: link.created_at,
      })),
  );

  return createMemo(() =>
    (linksQuery() as any[]).filter((link) => !link.deleted_at),
  );
}

export function useTicketActivities(ticketId: () => string) {
  const activitiesQuery = useLiveQuery((q) =>
    q
      .from({ activity: ticketActivitiesCollection })
      .where(({ activity }) => eq(activity.ticket_id, ticketId()))
      .orderBy(({ activity }) => activity.created_at, "desc")
      .select(({ activity }) => ({
        id: activity.id,
        ticket_id: activity.ticket_id,
        action: activity.action,
        field_name: activity.field_name,
        details: activity.details,
        created_by: activity.created_by,
        created_at: activity.created_at,
      })),
  );

  return activitiesQuery;
}

export function useOpenTicketConflicts() {
  const conflictsQuery = useLiveQuery((q) =>
    q
      .from({ conflict: ticketConflictsCollection })
      .where(({ conflict }) => eq(conflict.status, "open"))
      .orderBy(({ conflict }) => conflict.created_at, "desc")
      .select(({ conflict }) => ({
        id: conflict.id,
        ticket_id: conflict.ticket_id,
        field_name: conflict.field_name,
        local_value: conflict.local_value,
        server_value: conflict.server_value,
        created_at: conflict.created_at,
      })),
  );

  return conflictsQuery;
}

export function useTicketDescriptionUpdates(ticketId: () => string) {
  const updatesQuery = useLiveQuery((q) =>
    q
      .from({ update: ticketDescriptionUpdatesCollection })
      .where(({ update }) => eq(update.ticket_id, ticketId()))
      .orderBy(({ update }) => update.created_at, "asc")
      .select(({ update }) => ({
        id: update.id,
        ticket_id: update.ticket_id,
        update_b64: update.update_b64,
        created_by: update.created_by,
        created_at: update.created_at,
      })),
  );

  return updatesQuery;
}
