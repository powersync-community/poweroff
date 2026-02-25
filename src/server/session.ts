import { getCookie } from "vinxi/http";
import { getRequestEvent } from "solid-js/web";
import { DEMO_DEFAULT_USER, getDemoUserName } from "~/lib/demo-users";

export type ServerSession = {
  userId: string;
  userName: string;
};

export function getServerSession(): ServerSession {
  const event = getRequestEvent();
  const userId = event
    ? getCookie(event.nativeEvent, "ticket_user_id") || DEMO_DEFAULT_USER.id
    : DEMO_DEFAULT_USER.id;

  return {
    userId,
    userName: getDemoUserName(userId),
  };
}
