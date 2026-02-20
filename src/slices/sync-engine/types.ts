import { UpdateType } from "@powersync/common";

export type WriteOperation = {
  op: UpdateType;
  table: string;
  id: string;
  opData: Record<string, any>;
};

export type WriteResultCode = "applied" | "merged" | "rejected" | "needs_review";

export type WriteOperationResult = {
  opKey: string;
  table: string;
  id: string;
  result: WriteResultCode;
  reasonCode?: string;
  conflictId?: string;
};

export type SyncAuthClaims = {
  sub: string;
  aud: string;
  role: "tech" | "manager";
  user_id: string;
};
