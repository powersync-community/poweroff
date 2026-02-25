import { createSignal } from "solid-js";
import { DEMO_DEFAULT_USER, DEMO_USERS, getDemoUserName } from "~/lib/demo-users";

export type DemoSession = {
  userId: string;
  userName: string;
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const match = document.cookie.match(
    new RegExp(
      `(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );

  return match ? decodeURIComponent(match[1]) : null;
}

function buildSession(userId: string | null | undefined): DemoSession {
  const fallbackId = DEMO_DEFAULT_USER.id;
  const effectiveUserId = userId || fallbackId;

  return {
    userId: effectiveUserId,
    userName: getDemoUserName(effectiveUserId),
  };
}

export function getClientSession() {
  const userIdCookie = readCookie("ticket_user_id");
  return buildSession(userIdCookie);
}

const [clientSession] = createSignal(getClientSession());

export { clientSession };

export function setClientUser(userKey: keyof typeof DEMO_USERS) {
  const next = DEMO_USERS[userKey];
  if (typeof document !== "undefined") {
    document.cookie = `ticket_user_id=${next.id}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }
  window.location.reload();
}
