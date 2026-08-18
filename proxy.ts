import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

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
  if (isRoutePrefetch(request) || !hasSupabaseAuthCookie(request)) {
    return NextResponse.next({ request });
  }

  const { updateSupabaseSession } = await import("@/lib/supabase/proxy");
  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
