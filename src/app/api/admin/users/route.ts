import { NextRequest } from "next/server";
import { z } from "zod";

import {
  parseBody,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { createUser, listUsersWithStats } from "@/lib/admin/users";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(1).max(128),
  role: z.enum(["user", "admin"]).default("user"),
  notes: z.string().max(2_000).optional(),
});

export const GET = route(async (request: NextRequest) => {
  const auth = await requireUser(request, "admin");
  const result = await listUsersWithStats();
  return authenticatedResponse(auth, result);
});

export const POST = route(async (request: NextRequest) => {
  requireSameOrigin(request);
  const auth = await requireUser(request, "admin");
  const input = await parseBody(request, createSchema);
  const user = await createUser(auth.userDocument._id, input);
  return authenticatedResponse(auth, { user }, { status: 201 });
});
