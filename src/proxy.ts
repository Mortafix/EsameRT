import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/rt-lab-og.png";

  if (isPublic) return NextResponse.next();

  const hasSession = request.cookies.has("rtlab_session");
  if (!hasSession && !pathname.startsWith("/api/")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
