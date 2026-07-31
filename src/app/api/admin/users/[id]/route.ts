import { NextRequest } from "next/server";
import { z } from "zod";

import {
  parseBody,
  parseObjectId,
  requireSameOrigin,
  route,
} from "@/lib/api";
import { deleteUser, updateUser } from "@/lib/admin/users";
import { authenticatedResponse } from "@/lib/auth/response";
import { requireUser } from "@/lib/auth/sessions";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  revision: z.number().int().positive(),
  name: z.string().min(2).max(100).optional(),
  notes: z.string().max(2_000).optional(),
  role: z.enum(["user", "admin"]).optional(),
  isActive: z.boolean().optional(),
});
const deleteSchema = z.object({
  revision: z.number().int().positive(),
  confirmation: z.string().min(1).max(100),
});

export const PATCH = route(async (request: NextRequest, context: RouteContext) => {
  requireSameOrigin(request);
  const auth = await requireUser(request, "admin");
  const input = await parseBody(request, patchSchema);
  const { id } = await context.params;
  const user = await updateUser(
    auth.userDocument._id,
    parseObjectId(id, "ID utente"),
    input.revision,
    {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      ...(input.role === undefined ? {} : { role: input.role }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
  );
  return authenticatedResponse(auth, { user });
});

export const DELETE = route(async (request: NextRequest, context: RouteContext) => {
  requireSameOrigin(request);
  const auth = await requireUser(request, "admin");
  const input = await parseBody(request, deleteSchema);
  const { id } = await context.params;
  const result = await deleteUser(
    auth.userDocument._id,
    parseObjectId(id, "ID utente"),
    input.revision,
    input.confirmation,
  );
  return authenticatedResponse(auth, result);
});
