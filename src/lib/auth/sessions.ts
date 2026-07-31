import { createHmac, randomBytes } from "node:crypto";

import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";

import { ApiError } from "@/lib/api";
import {
  getConfig,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
  SESSION_RENEW_WINDOW_MS,
} from "@/lib/config";
import { collections } from "@/lib/db/collections";
import type {
  AuthenticatedUser,
  SessionDocument,
  UserDocument,
  UserRole,
} from "@/types/domain";

export interface AuthContext {
  user: AuthenticatedUser;
  userDocument: UserDocument;
  session: SessionDocument;
  cookieToken: string;
  refreshCookie: boolean;
}

export function digestSessionToken(token: string): string {
  return createHmac("sha256", getConfig().SESSION_PEPPER)
    .update(token)
    .digest("base64url");
}

function digestIp(ip: string): string {
  return createHmac("sha256", getConfig().AUTH_PEPPER).update(ip).digest("base64url");
}

export function requestIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function requestIpHash(request: NextRequest): string {
  return digestIp(requestIp(request));
}

export async function createSession(
  userId: ObjectId,
  request: NextRequest,
): Promise<{ session: SessionDocument; token: string }> {
  const { sessions } = await collections();
  const now = new Date();
  const token = randomBytes(32).toString("base64url");
  const session: SessionDocument = {
    _id: new ObjectId(),
    userId,
    tokenDigest: digestSessionToken(token),
    authenticatedAt: now,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
    userAgent: request.headers.get("user-agent")?.slice(0, 500),
    ipHash: requestIpHash(request),
  };
  await sessions.insertOne(session);
  return { session, token };
}

export async function requireUser(
  request: NextRequest,
  requiredRole?: UserRole,
): Promise<AuthContext> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    throw new ApiError(401, "AUTH_REQUIRED", "Devi effettuare l’accesso.");
  }

  const { sessions, users } = await collections();
  const now = new Date();
  const session = await sessions.findOne({
    tokenDigest: digestSessionToken(token),
    revokedAt: { $exists: false },
    expiresAt: { $gt: now },
  });
  if (!session) {
    throw new ApiError(401, "SESSION_INVALID", "La sessione non è più valida.");
  }

  const user = await users.findOne({ _id: session.userId, isActive: true });
  if (!user) {
    await sessions.updateOne({ _id: session._id }, { $set: { revokedAt: now } });
    throw new ApiError(401, "SESSION_INVALID", "La sessione non è più valida.");
  }
  if (requiredRole && user.role !== requiredRole) {
    throw new ApiError(403, "FORBIDDEN", "Non hai i permessi necessari.");
  }

  const refreshCookie =
    session.expiresAt.getTime() - now.getTime() <= SESSION_RENEW_WINDOW_MS;
  const nextExpiry = refreshCookie
    ? new Date(now.getTime() + SESSION_DURATION_MS)
    : session.expiresAt;
  await sessions.updateOne(
    { _id: session._id, revokedAt: { $exists: false } },
    {
      $set: {
        lastSeenAt: now,
        ...(refreshCookie ? { expiresAt: nextExpiry } : {}),
      },
    },
  );
  session.lastSeenAt = now;
  session.expiresAt = nextExpiry;

  return {
    user: {
      id: user._id.toHexString(),
      name: user.name,
      role: user.role,
      revision: user.revision,
    },
    userDocument: user,
    session,
    cookieToken: token,
    refreshCookie,
  };
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: getConfig().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: getConfig().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  });
}

export function applyRollingCookie(response: NextResponse, context: AuthContext): void {
  if (context.refreshCookie) {
    setSessionCookie(response, context.cookieToken, context.session.expiresAt);
  }
}
