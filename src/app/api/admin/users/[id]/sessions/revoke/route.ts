import { NextRequest } from "next/server";

import {
  parseObjectId,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { revokeUserSessions } from "@/lib/admin/users";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export const POST = route(async (request: NextRequest, context: RouteContext) => {
  requireSameOrigin(request);
  const auth = await requireUser(request, "admin");
  const { id } = await context.params;
  const result = await revokeUserSessions(
    auth.userDocument._id,
    parseObjectId(id, "ID utente"),
  );
  return authenticatedResponse(auth, result);
});
