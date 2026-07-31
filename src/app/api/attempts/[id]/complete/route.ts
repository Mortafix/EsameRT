import { NextRequest } from "next/server";
import { z } from "zod";

import {
  getIdempotencyKey,
  parseBody,
  parseObjectId,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";
import { completeAttempt } from "@/lib/exams/attempts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({
  revision: z.number().int().positive(),
  confirmed: z.boolean().optional(),
  reason: z.enum(["submitted", "expired"]).optional(),
});

export const POST = route(async (request: NextRequest, context: RouteContext) => {
  requireSameOrigin(request);
  const auth = await requireUser(request);
  const input = await parseBody(request, schema);
  const { id } = await context.params;
  const attempt = await completeAttempt(
    parseObjectId(id, "ID quiz"),
    auth.userDocument._id,
    input.revision,
    input.confirmed ?? input.reason !== undefined,
    getIdempotencyKey(request),
  );
  return authenticatedResponse(auth, { attempt });
});
