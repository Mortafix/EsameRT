import { NextRequest } from "next/server";
import { z } from "zod";

import {
  getIdempotencyKey,
  parseBody,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";
import { getOpenAttempt, startAttempt } from "@/lib/exams/attempts";
import { EXAM_TYPES, MODULES } from "@/types/domain";

export const runtime = "nodejs";

const startSchema = z.object({
  examType: z.enum(EXAM_TYPES),
  module: z.enum(MODULES),
});

export const GET = route(async (request: NextRequest) => {
  const context = await requireUser(request);
  const attempt = await getOpenAttempt(context.userDocument._id);
  return authenticatedResponse(context, { attempt });
});

export const POST = route(async (request: NextRequest) => {
  requireSameOrigin(request);
  const context = await requireUser(request);
  const input = await parseBody(request, startSchema);
  const attempt = await startAttempt(
    context.userDocument._id,
    input.examType,
    input.module,
    getIdempotencyKey(request),
  );
  return authenticatedResponse(context, { attempt }, { status: 201 });
});
