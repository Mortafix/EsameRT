import { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";
import { personalStats } from "@/lib/stats/personal";
import { EXAM_TYPES, MODULES } from "@/types/domain";

export const runtime = "nodejs";

const querySchema = z.object({
  period: z.enum(["30d", "90d", "1y"]).optional(),
  module: z.enum(MODULES).optional(),
  examType: z.enum(EXAM_TYPES).optional(),
});

export const GET = route(async (request: NextRequest) => {
  const auth = await requireUser(request);
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const periodDays = query.period
    ? { "30d": 30, "90d": 90, "1y": 365 }[query.period]
    : undefined;
  const stats = await personalStats(auth.userDocument._id, {
    ...(periodDays
      ? { since: new Date(Date.now() - periodDays * 86_400_000) }
      : {}),
    ...(query.module ? { module: query.module } : {}),
    ...(query.examType ? { examType: query.examType } : {}),
  });
  return authenticatedResponse(auth, stats);
});
