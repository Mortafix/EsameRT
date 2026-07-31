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
import { saveAnswer } from "@/lib/exams/attempts";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const answerSchema = z
  .object({
    revision: z.number().int().positive(),
    questionIndex: z.number().int().min(0).max(39).optional(),
    questionId: z.string().optional(),
    selectedOptionId: z.string().min(1).max(32).nullable().optional(),
    optionId: z.string().min(1).max(32).nullable().optional(),
    visited: z.boolean().optional(),
    skipped: z.boolean().optional(),
    timeSpentMs: z.number().int().min(0).max(600_000).optional(),
  })
  .refine(
    (value) => value.questionIndex !== undefined || value.questionId !== undefined,
    { message: "Indicare questionIndex oppure questionId." },
  )
  .refine(
    (value) =>
      value.selectedOptionId !== undefined || value.optionId !== undefined,
    { message: "Indicare selectedOptionId oppure optionId." },
  );

const save = route(async (request: NextRequest, context: RouteContext) => {
  requireSameOrigin(request);
  const auth = await requireUser(request);
  const input = await parseBody(request, answerSchema);
  const { id } = await context.params;
  const attempt = await saveAnswer(
    parseObjectId(id, "ID quiz"),
    auth.userDocument._id,
    {
      revision: input.revision,
      ...(input.questionIndex === undefined
        ? {}
        : { questionIndex: input.questionIndex }),
      ...(input.questionId
        ? { questionId: parseObjectId(input.questionId, "ID domanda") }
        : {}),
      selectedOptionId:
        input.selectedOptionId !== undefined
          ? input.selectedOptionId
          : (input.optionId ?? null),
      ...(input.skipped === undefined ? {} : { skipped: input.skipped }),
      ...(input.timeSpentMs === undefined
        ? {}
        : { timeSpentMs: input.timeSpentMs }),
    },
    getIdempotencyKey(request),
  );
  return authenticatedResponse(auth, { attempt, revision: attempt.revision });
});

export const PUT = save;
export const POST = save;
