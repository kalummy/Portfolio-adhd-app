import type { User } from '@supabase/supabase-js';
import type { AddiProfileId } from '@/lib/profile';
import { nativeAuth } from './boundaries';
export type AuthState = { isAuthenticated: boolean; user: User | null };
// Synthetic display context, never a Supabase session or token.
const fixtureUser: User = { id: 'native-fixture-user', aud: 'fixture', app_metadata: {}, user_metadata: { name: '프로토타입', full_name: '프로토타입', addi_profile: 'default' }, created_at: '2026-09-15T00:00:00Z' };
export async function getCurrentUser() { return structuredClone(fixtureUser); }
export async function getAuthState(): Promise<AuthState> { return { isAuthenticated: true, user: await getCurrentUser() }; }
export async function updateAddiProfile(profileId: AddiProfileId) {
  fixtureUser.user_metadata.addi_profile = profileId;
  return structuredClone(fixtureUser);
}
export const signOut = () => nativeAuth.signOut();
