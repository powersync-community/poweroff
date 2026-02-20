import { createEffect, createSignal } from "solid-js";
import { DEMO_USERS, type DemoRole } from "~/lib/demo-users";

export type DemoSession = {
  userId: string;
  role: DemoRole;
  userName: string;
};

function buildSession(role: DemoRole) {
  if (role === "manager") {
    return {
      userId: DEMO_USERS.manager.id,
      role: "manager",
      userName: DEMO_USERS.manager.name,
    } satisfies DemoSession;
  }

  return {
    userId: DEMO_USERS.tech.id,
    role: "tech",
    userName: DEMO_USERS.tech.name,
  } satisfies DemoSession;
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(
      `(?:^|;\\s*)${name.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}=([^;]*)`,
    ),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

export function getClientSession() {
  const role = readCookie("wo_role") as DemoRole | null;
  return buildSession(role === "manager" ? "manager" : "tech");
}

const [clientSession, setClientSession] = createSignal(getClientSession());

export { clientSession };

export function setClientRole(role: DemoRole) {
  console.log("[session] set client role", role);
  document.cookie = `wo_role=${role}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  const userId =
    role === "manager" ? DEMO_USERS.manager.id : DEMO_USERS.tech.id;
  document.cookie = `wo_user_id=${userId}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

  setClientSession(buildSession(role));
  console.log("[session] updated client session", clientSession());
}

createEffect(() => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const role = params.get("role");
  if (role === "manager" || role === "tech") {
    console.log("[session] forcing role from query param", role);
    setClientRole(role);
  }
});
