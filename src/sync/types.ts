export type SyncOutcome = "applied" | "merged" | "rejected" | "needs_review";

export type UploadResult = {
  opKey: string;
  table: string;
  id: string;
  result: SyncOutcome;
  reasonCode?: string;
  conflictId?: string;
};

export type SyncAuthClaims = {
  sub: string;
  aud: string;
  user_id: string;
};
