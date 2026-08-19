import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_COMPLETED_QUERY_KEY } from "@/lib/analytics/schema";
import { getSafeNextPath } from "@/lib/auth/redirect";
import { ensureUserProfile } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function loginFallback(request: NextRequest, reason: string) {
  const url = new URL("/auth/login", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code) return loginFallback(request, "oauth_callback");

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError || !data.user) return loginFallback(request, "oauth_callback");

    const { error: profileError } = await ensureUserProfile(supabase, data.user.id);
    if (profileError) return loginFallback(request, "profile");

    const destination = new URL(nextPath, request.url);
    destination.searchParams.set(LOGIN_COMPLETED_QUERY_KEY, "1");
    return NextResponse.redirect(destination);
  } catch {
    return loginFallback(request, "configuration");
  }
}
