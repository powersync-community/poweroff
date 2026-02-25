import { createMiddleware } from "@solidjs/start/middleware";
import { getCookie, setCookie } from "vinxi/http";
import { DEMO_DEFAULT_USER } from "~/lib/demo-users";

export default createMiddleware({
  onRequest: async (event) => {
    const currentUserId = getCookie(event.nativeEvent, "ticket_user_id");
    if (currentUserId) return;

    setCookie(event.nativeEvent, "ticket_user_id", DEMO_DEFAULT_USER.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  },
});
