import { NextRequest } from "next/server";

import { route } from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";

export const runtime = "nodejs";

export const GET = route(async (request: NextRequest) => {
  const context = await requireUser(request);
  return authenticatedResponse(context, {
    user: context.user,
    session: {
      createdAt: context.session.createdAt,
      lastSeenAt: context.session.lastSeenAt,
      expiresAt: context.session.expiresAt,
    },
  });
});
