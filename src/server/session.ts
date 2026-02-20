import { getCookie } from "vinxi/http";
import { getRequestEvent } from "solid-js/web";
import { DEMO_USERS, type DemoRole } from "~/lib/demo-users";

export type ServerSession = {
  userId: string;
  role: DemoRole;
  userName: string;
};

export function getServerSession(): ServerSession {
  const event = getRequestEvent();

  const roleCookie = event ? getCookie(event.nativeEvent, "wo_role") : null;
  const role: DemoRole = roleCookie === "manager" ? "manager" : "tech";
  const profile = role === "manager" ? DEMO_USERS.manager : DEMO_USERS.tech;

  return {
    userId: profile.id,
    role,
    userName: profile.name,
  };
}
