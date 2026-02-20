export const TECH_USER_ID = "11111111-1111-1111-1111-111111111111";
export const MANAGER_USER_ID = "22222222-2222-2222-2222-222222222222";

export type DemoRole = "tech" | "manager";

export const DEMO_USERS = {
  tech: {
    id: TECH_USER_ID,
    name: "Tech A",
    role: "tech" as const,
  },
  manager: {
    id: MANAGER_USER_ID,
    name: "Manager M",
    role: "manager" as const,
  },
};
