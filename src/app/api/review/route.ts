import { NextRequest } from "next/server";
import { z } from "zod";

import {
  ApiError,
  parseBody,
  parseObjectId,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";
import {
  answerReviewQuestion,
  reviewFeed,
} from "@/lib/review/service";
import { MODULES } from "@/types/domain";

export const runtime = "nodejs";

const querySchema = z.object({
  module: z.union([z.enum(MODULES), z.literal("all")]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionId: z.string().min(1).max(32).optional(),
  optionId: z.string().min(1).max(32).optional(),
  reviewSessionId: z.string().min(8).max(128).optional(),
});

export const GET = route(async (request: NextRequest) => {
  const auth = await requireUser(request);
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const feed = await reviewFeed(
    auth.userDocument._id,
    query.module === "all" ? undefined : query.module,
    query.limit,
  );
  const items = feed.questions.map((question) => ({
    id: question.questionId,
    questionId: question.questionId,
    ministryId: question.ministryId,
    ministerialId: question.ministryId,
    text: question.text,
    subject: question.subject,
    module: question.module,
    options: question.options,
    wrongCount: question.metrics.wrong,
    seenCount: question.metrics.attempts,
    metrics: question.metrics,
  }));
  return authenticatedResponse(auth, {
    items,
    questions: feed.questions,
    metrics: {
      available: items.length,
      reviewed: 0,
      correct: 0,
    },
  });
});

export const POST = route(async (request: NextRequest) => {
  requireSameOrigin(request);
  const auth = await requireUser(request);
  const input = await parseBody(request, answerSchema);
  const optionId = input.selectedOptionId ?? input.optionId;
  if (!optionId) {
    throw new ApiError(
      400,
      "INVALID_OPTION",
      "Risposta selezionata non valida.",
    );
  }
  const result = await answerReviewQuestion(auth.userDocument._id, {
    questionId: parseObjectId(input.questionId, "ID domanda"),
    selectedOptionId: optionId,
    reviewSessionId:
      input.reviewSessionId ?? `session-${auth.session._id.toHexString()}`,
  });
  return authenticatedResponse(auth, result, { status: 201 });
});
