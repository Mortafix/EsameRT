import { NextRequest } from "next/server";

import { parseObjectId, requireSameOrigin, route } from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";
import { deleteAttempt, getAttempt } from "@/lib/exams/attempts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export const GET = route(async (request: NextRequest, context: RouteContext) => {
  const auth = await requireUser(request);
  const { id } = await context.params;
  const attempt = await getAttempt(
    parseObjectId(id, "ID quiz"),
    auth.userDocument._id,
  );
  return authenticatedResponse(auth, { attempt });
});

export const DELETE = route(
  async (request: NextRequest, context: RouteContext) => {
    requireSameOrigin(request);
    const auth = await requireUser(request);
    const { id } = await context.params;
    await deleteAttempt(
      parseObjectId(id, "ID quiz"),
      auth.userDocument._id,
    );
    return authenticatedResponse(auth, { deleted: true });
  },
);
