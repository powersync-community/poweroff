import { getServerSession } from "~/server/session";
import { resolveConflictRecord } from "~/slices/conflict-record/mutation.server";
import { processWriteBatch } from "~/slices/sync-engine/reaction.process-write-batch.server";
import type { WriteOperation } from "~/slices/sync-engine/types";

export async function uploadData(operations: WriteOperation[]) {
  "use server";

  const session = getServerSession();

  try {
    const results = await processWriteBatch(operations, session);
    return {
      success: true,
      results,
    };
  } catch (error: any) {
    console.error("[write-batch] failed", error);
    return {
      success: false,
      error: error?.message || "write_batch_failed",
      results: [],
    };
  }
}

export async function resolveConflict(
  id: string,
  strategy: "local" | "server" | "custom",
  customValue?: string,
) {
  "use server";

  const session = getServerSession();
  if (session.role !== "manager") {
    throw new Error("Manager role required");
  }

  const resolved = await resolveConflictRecord(
    id,
    strategy,
    session.userId,
    customValue,
  );

  return {
    success: true,
    resolved,
  };
}
