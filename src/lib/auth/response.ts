import { NextResponse } from "next/server";

import { applyRollingCookie, type AuthContext } from "@/lib/auth/sessions";

export function authenticatedResponse<T>(
  context: AuthContext,
  data: T,
  init?: ResponseInit,
): NextResponse {
  const response = NextResponse.json({ data }, init);
  applyRollingCookie(response, context);
  return response;
}
