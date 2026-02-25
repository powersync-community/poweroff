export type DemoStrategyId =
  | "lww"
  | "restricted"
  | "audit-log"
  | "domain-resolution"
  | "manual-resolution"
  | "crdt";

export const STRATEGY_ROUTES: Array<{
  id: DemoStrategyId;
  href: string;
  title: string;
  summary: string;
}> = [
  {
    id: "lww",
    href: "/demo/lww",
    title: "Last Write Wins",
    summary: "Default behavior: latest accepted write wins.",
  },
  {
    id: "restricted",
    href: "/demo/restricted",
    title: "Restricted Offline",
    summary: "Disable destructive edits while offline.",
  },
  {
    id: "audit-log",
    href: "/demo/audit-log",
    title: "Audit Log",
    summary: "Every change records a history row.",
  },
  {
    id: "domain-resolution",
    href: "/demo/domain-resolution",
    title: "Domain Rule",
    summary: "Done status wins against stale reopen attempts.",
  },
  {
    id: "manual-resolution",
    href: "/demo/manual-resolution",
    title: "Manual Resolution",
    summary: "Conflict inbox allows local/server/custom resolution.",
  },
  {
    id: "crdt",
    href: "/demo/crdt",
    title: "CRDT Description",
    summary: "Collaborative ticket description via Yjs updates.",
  },
];
