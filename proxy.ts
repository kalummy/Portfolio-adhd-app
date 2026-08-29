import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isPublicRequestPath } from "@/lib/auth/routes";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some(({ name }) =>
    /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i.test(name),
  );
}

function isRoutePrefetch(request: NextRequest) {
  return request.headers.get("next-router-prefetch") === "1"
    || request.headers.get("purpose") === "prefetch";
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublicRoute = isPublicRequestPath(pathname);
  const hasAuthCookie = hasSupabaseAuthCookie(request);

  if (!hasAuthCookie) {
    if (!isPublicRoute) {
      const loginUrl = new URL("/auth/login", request.url);
      const nextPath = `${pathname}${request.nextUrl.search}`;
      if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next({ request });
  }

  if (isRoutePrefetch(request)) return NextResponse.next({ request });

  const { updateSupabaseSession } = await import("@/lib/supabase/proxy");
  const { response, isAuthenticated } = await updateSupabaseSession(request);

  if (!isPublicRoute && !isAuthenticated) {
    const loginUrl = new URL("/auth/login", request.url);
    const nextPath = `${pathname}${request.nextUrl.search}`;
    if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
