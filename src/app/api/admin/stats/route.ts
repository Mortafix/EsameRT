import { NextRequest } from "next/server";
import { z } from "zod";

import { route } from "@/lib/api";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";
import { adminStats } from "@/lib/stats/admin";

export const runtime = "nodejs";

const querySchema = z.object({
  period: z.enum(["7d", "30d", "90d", "1y"]).optional(),
});

export const GET = route(async (request: NextRequest) => {
  const auth = await requireUser(request, "admin");
  const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
  const days = query.period
    ? { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[query.period]
    : undefined;
  const stats = await adminStats(
    new Date(),
    days ? new Date(Date.now() - days * 86_400_000) : undefined,
  );
  return authenticatedResponse(auth, stats);
});
