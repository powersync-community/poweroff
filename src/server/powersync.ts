import { CrudEntry } from "@powersync/common";
import { SignJWT } from "jose";
import { resolveTicketConflict } from "~/data/server/conflicts";
import { processWriteBatch } from "~/data/server/write-batch";
import { getServerSession } from "~/server/session";
import type { SyncAuthClaims } from "~/sync/types";

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(b64url.length / 4) * 4, "=");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export async function getPowerSyncToken() {
  "use server";

  const session = getServerSession();
  const kid = process.env.POWERSYNC_JWT_KID;
  const secretB64url = process.env.POWERSYNC_JWT_SECRET_B64URL;
  const audience = process.env.POWERSYNC_JWT_AUDIENCE;

  if (!kid || !secretB64url || !audience) {
    throw new Error(
      "POWERSYNC_JWT_KID, POWERSYNC_JWT_SECRET_B64URL, and POWERSYNC_JWT_AUDIENCE must be set",
    );
  }

  const key = base64urlToBytes(secretB64url);

  const claims: SyncAuthClaims = {
    sub: session.userId,
    aud: audience,
    user_id: session.userId,
  };

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", kid })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);

  return {
    token,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

export async function uploadData(operations: CrudEntry[]) {
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
  const resolved = await resolveTicketConflict({
    conflictId: id,
    strategy,
    customValue,
    resolvedBy: session.userId,
  });

  return {
    success: true,
    resolved,
  };
}
