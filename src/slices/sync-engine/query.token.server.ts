import { SignJWT } from "jose";
import { getServerSession } from "~/server/session";
import type { SyncAuthClaims } from "~/slices/sync-engine/types";

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
    role: session.role,
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
