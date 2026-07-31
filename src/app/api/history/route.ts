import { NextRequest } from "next/server";
import { z } from "zod";

import { ApiError, route } from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";
import { listHistory } from "@/lib/exams/attempts";
import { EXAM_TYPES, MODULES } from "@/types/domain";

export const runtime = "nodejs";

const querySchema = z.object({
  module: z.enum(MODULES).optional(),
  examType: z.enum(EXAM_TYPES).optional(),
  passed: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  before: z.string().datetime().optional(),
});

export const GET = route(async (request: NextRequest) => {
  const auth = await requireUser(request);
  const values = Object.fromEntries(request.nextUrl.searchParams);
  const query = querySchema.parse(values);
  const before = query.before ? new Date(query.before) : undefined;
  if (before && Number.isNaN(before.getTime())) {
    throw new ApiError(400, "INVALID_DATE", "Data di paginazione non valida.");
  }
  const history = await listHistory(auth.userDocument._id, {
    ...(query.module ? { module: query.module } : {}),
    ...(query.examType ? { examType: query.examType } : {}),
    ...(query.passed ? { passed: query.passed === "true" } : {}),
    limit: query.limit,
    ...(before ? { before } : {}),
  });
  const items = history.attempts.map((attempt) => ({
    id: attempt.id,
    module: attempt.module,
    examType: attempt.examType,
    status: attempt.status,
    score: attempt.summary.score,
    threshold: attempt.summary.threshold,
    passed: attempt.summary.passed,
    correctCount: attempt.summary.correct,
    wrongCount: attempt.summary.wrong,
    omittedCount: attempt.summary.omitted,
    activeSeconds: Math.round(attempt.summary.activeTimeMs / 1_000),
    completedAt: attempt.completedAt,
  }));
  return authenticatedResponse(auth, {
    items,
    attempts: history.attempts,
    total: items.length,
    ...(history.nextBefore ? { nextBefore: history.nextBefore } : {}),
  });
});
