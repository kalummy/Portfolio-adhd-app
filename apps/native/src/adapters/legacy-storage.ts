// Native Auth has no claimed guest IndexedDB dataset. Shared My logout may call
// this web cleanup hook; nothing needs restoring and it must not block sign-out.
export async function restoreClaimedGuestDatasetVisibilityForUser(_userId: string) { return; }
