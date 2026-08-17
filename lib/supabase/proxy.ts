import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig, isSupabaseConfigured } from "./config";

export async function updateSupabaseSession(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next({ request });

  try {
    const { url, publishableKey } = getSupabaseConfig();
    let response = NextResponse.next({ request });
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    await supabase.auth.getClaims();
    return response;
  } catch {
    // Auth is optional in this phase. A Supabase outage must not block guest routes.
    return NextResponse.next({ request });
  }
}
