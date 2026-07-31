import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ApiError, parseBody, requireSameOrigin, route } from "@/lib/api";
import {
  codeVerificationCandidates,
  digestCode,
  normalizeCode,
  validateCode,
  verifyCodeHash,
} from "@/lib/auth/codes";
import { isLoginRateLimited } from "@/lib/auth/rate-limit";
import {
  createSession,
  requestIpHash,
  setSessionCookie,
} from "@/lib/auth/sessions";
import { collections } from "@/lib/db/collections";

export const runtime = "nodejs";

const loginSchema = z.object({
  code: z.string().min(1).max(128),
});

export const POST = route(async (request: NextRequest) => {
  requireSameOrigin(request);
  const { code } = await parseBody(request, loginSchema);
  const normalizedLoose = normalizeCode(code);
  const codeDigest = digestCode(normalizedLoose);
  const ipHash = requestIpHash(request);
  const { users, loginEvents } = await collections();
  const now = new Date();

  if (await isLoginRateLimited(codeDigest, ipHash, now)) {
    await loginEvents.insertOne({
      _id: new ObjectId(),
      codeDigest,
      ipHash,
      success: false,
      reason: "rate_limited",
      createdAt: now,
    });
    throw new ApiError(
      429,
      "LOGIN_RATE_LIMITED",
      "Troppi tentativi. Riprova tra qualche minuto.",
    );
  }

  let normalized: string;
  try {
    normalized = validateCode(code);
  } catch {
    await loginEvents.insertOne({
      _id: new ObjectId(),
      codeDigest,
      ipHash,
      success: false,
      reason: "invalid",
      createdAt: now,
    });
    throw new ApiError(401, "INVALID_CODE", "Codice non valido.");
  }

  let user = null;
  let verified = false;
  for (const candidate of codeVerificationCandidates(normalized)) {
    const candidateUser = await users.findOne({ codeDigest: digestCode(candidate) });
    if (candidateUser && (await verifyCodeHash(candidateUser.codeHash, candidate))) {
      user = candidateUser;
      verified = true;
      break;
    }
  }
  if (!user || !verified || !user.isActive) {
    await loginEvents.insertOne({
      _id: new ObjectId(),
      ...(user ? { userId: user._id } : {}),
      codeDigest,
      ipHash,
      success: false,
      reason: user && !user.isActive ? "disabled" : "invalid",
      createdAt: now,
    });
    throw new ApiError(401, "INVALID_CODE", "Codice non valido.");
  }

  const { session, token } = await createSession(user._id, request);
  await Promise.all([
    users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } }),
    loginEvents.insertOne({
      _id: new ObjectId(),
      userId: user._id,
      codeDigest,
      ipHash,
      success: true,
      createdAt: now,
    }),
  ]);
  const response = NextResponse.json({
    data: {
      user: {
        id: user._id.toHexString(),
        name: user.name,
        role: user.role,
        revision: user.revision,
      },
      expiresAt: session.expiresAt,
    },
  });
  setSessionCookie(response, token, session.expiresAt);
  return response;
});
