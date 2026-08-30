import type { Provider, User, UserIdentity } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  ADDI_PROFILE_METADATA_KEY,
  type AddiProfileId,
} from "@/lib/profile";
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

export type AddiOAuthProvider = MemberOAuthProvider;

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

export async function getLinkedOAuthIdentities() {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;

  return data.identities.filter(
    (identity): identity is UserIdentity & { provider: AddiOAuthProvider } => (
      identity.provider === "google" || identity.provider === "kakao"
    ),
  );
}

export async function linkOAuthIdentity(
  provider: AddiOAuthProvider,
  nextPath = "/my/social-login",
) {
  const supabase = createBrowserSupabaseClient();
  const callbackUrl = new URL("/auth/callback", window.location.origin);
  const safeNextPath = getSafeNextPath(nextPath);
  callbackUrl.searchParams.set("next", safeNextPath);

  const { error } = await supabase.auth.linkIdentity({
    provider: provider as Provider,
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error) throw error;
}

export async function unlinkOAuthIdentity(provider: AddiOAuthProvider) {
  const supabase = createBrowserSupabaseClient();
  const identities = await getLinkedOAuthIdentities();
  if (identities.length <= 1) throw new Error("last_identity");

  const identity = identities.find((candidate) => candidate.provider === provider);
  if (!identity) throw new Error("identity_not_found");

  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw error;
}

export async function updateAddiProfile(profileId: AddiProfileId) {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase.auth.updateUser({
    data: { [ADDI_PROFILE_METADATA_KEY]: profileId },
  });
  if (error) throw error;
  window.dispatchEvent(new CustomEvent("addi:profile-changed", { detail: { profileId } }));
  return data.user;
}

export async function signOut() {
  const { unsubscribeFromPush } = await import("@/lib/push/client");
  await unsubscribeFromPush().catch(() => undefined);
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function clearDeletedAccountSession() {
  const { unsubscribeFromPush } = await import("@/lib/push/client");
  await unsubscribeFromPush().catch(() => undefined);
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) throw error;
}
