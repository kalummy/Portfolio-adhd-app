import type { User } from '@supabase/supabase-js';
import { ADDI_PROFILE_METADATA_KEY, type AddiProfileId } from '@/lib/profile';
import { getNativeClient } from '../auth/client';
import { getNativeAuthSnapshot, requireNativeUser, signInNative, signOutNative } from '../auth/runtime';
export type AuthState = { isAuthenticated: boolean; user: User | null };
export async function getCurrentUser() { return getNativeAuthSnapshot().user; }
export async function getAuthState(): Promise<AuthState> { const user = await getCurrentUser(); return { isAuthenticated: Boolean(user), user }; }
export async function updateAddiProfile(profileId: AddiProfileId) {
  await requireNativeUser();
  const { data, error } = await getNativeClient().auth.updateUser({ data: { [ADDI_PROFILE_METADATA_KEY]: profileId } });
  if (error) throw new Error('profile_update_failed');
  window.dispatchEvent(new CustomEvent('addi:profile-changed', { detail: { profileId } }));
  return data.user;
}
export const signInWithGoogle = () => signInNative('google');
export const signInWithKakao = () => signInNative('kakao');
export const signOut = signOutNative;

export const clearDeletedAccountSession = signOutNative;
