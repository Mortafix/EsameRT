import { NextRequest } from "next/server";
import { z } from "zod";

import {
  parseBody,
  parseObjectId,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { revealUserCode } from "@/lib/admin/users";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({ adminCode: z.string().min(1).max(128) });

export const POST = route(async (request: NextRequest, context: RouteContext) => {
  requireSameOrigin(request);
  const auth = await requireUser(request, "admin");
  const input = await parseBody(request, schema);
  const { id } = await context.params;
  const result = await revealUserCode(
    auth,
    parseObjectId(id, "ID utente"),
    input.adminCode,
  );
  return authenticatedResponse(auth, result);
});
