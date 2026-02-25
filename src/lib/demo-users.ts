export const DEMO_USER_IDS = {
  alex: "11111111-1111-1111-1111-111111111111",
  sam: "22222222-2222-2222-2222-222222222222",
  riley: "33333333-3333-3333-3333-333333333333",
} as const;

export type DemoUserId = (typeof DEMO_USER_IDS)[keyof typeof DEMO_USER_IDS];

export const DEMO_USERS = {
  alex: {
    id: DEMO_USER_IDS.alex,
    name: "Alex",
  },
  sam: {
    id: DEMO_USER_IDS.sam,
    name: "Sam",
  },
  riley: {
    id: DEMO_USER_IDS.riley,
    name: "Riley",
  },
} as const;

export const DEMO_DEFAULT_USER = DEMO_USERS.alex;

export function getDemoUserName(userId: string | null | undefined) {
  if (!userId) return "Unknown";

  const all = Object.values(DEMO_USERS);
  const found = all.find((user) => user.id === userId);
  return found?.name ?? "Unknown";
}
