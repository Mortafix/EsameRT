import { NextRequest } from "next/server";
import { z } from "zod";

import {
  parseBody,
  parseObjectId,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { changeUserCode } from "@/lib/admin/users";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({
  revision: z.number().int().positive(),
  code: z.string().min(1).max(128),
});

export const POST = route(async (request: NextRequest, context: RouteContext) => {
  requireSameOrigin(request);
  const auth = await requireUser(request, "admin");
  const input = await parseBody(request, schema);
  const { id } = await context.params;
  const user = await changeUserCode(
    auth.userDocument._id,
    parseObjectId(id, "ID utente"),
    input.revision,
    input.code,
  );
  return authenticatedResponse(auth, { user });
});
