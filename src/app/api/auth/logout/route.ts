import { NextRequest, NextResponse } from "next/server";

import { requireSameOrigin, route } from "@/lib/api";
import {
  clearSessionCookie,
  digestSessionToken,
} from "@/lib/auth/sessions";
import { SESSION_COOKIE_NAME } from "@/lib/config";
import { collections } from "@/lib/db/collections";

export const runtime = "nodejs";

export const POST = route(async (request: NextRequest) => {
  requireSameOrigin(request);
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const { sessions } = await collections();
    await sessions.updateOne(
      { tokenDigest: digestSessionToken(token), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
  }
  const response = NextResponse.json({ data: { loggedOut: true } });
  clearSessionCookie(response);
  return response;
});
