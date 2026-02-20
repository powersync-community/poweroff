import { createMiddleware } from "@solidjs/start/middleware";
import { getCookie, setCookie } from "vinxi/http";
import { DEMO_USERS } from "~/lib/demo-users";

export default createMiddleware({
  onRequest: async (event) => {
    const currentRole = getCookie(event.nativeEvent, "wo_role");
    if (currentRole === "tech" || currentRole === "manager") return;

    setCookie(event.nativeEvent, "wo_role", "tech", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    setCookie(event.nativeEvent, "wo_user_id", DEMO_USERS.tech.id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  },
});
