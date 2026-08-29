import type { User } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "./redirect";

export type AuthState = {
  isAuthenticated: boolean;
  user: User | null;
};

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

export async function getAuthState(): Promise<AuthState> {
  const user = await getCurrentUser();
  return { isAuthenticated: Boolean(user), user };
}

type MemberOAuthProvider = "google" | "kakao";

async function signInWithProvider(provider: MemberOAuthProvider, nextPath = "/") {
  const supabase = createBrowserSupabaseClient();
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  const safeNextPath = getSafeNextPath(nextPath);
  if (safeNextPath !== "/") callbackUrl.searchParams.set("next", safeNextPath);

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: callbackUrl.toString() },
  });

  if (error) throw error;
}

export function signInWithGoogle(nextPath = "/") {
  return signInWithProvider("google", nextPath);
}

export function signInWithKakao(nextPath = "/") {
  return signInWithProvider("kakao", nextPath);
}

export async function signOut() {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
