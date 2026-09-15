# Dev OAuth acceptance setup

The public Dev callback is configured at `https://addi-galaxy-auth-dev.vercel.app/auth/native/callback` in a separate static Vercel project. ADDI Dev Supabase and the existing Google/Kakao providers are used. Final existing-account Galaxy acceptance passed; see [final QA](phase2-final-qa.md). The steps below document reproduction, not pending configuration work.

## Required Dev configuration

1. Provide a fixed, public, Production-independent HTTPS Dev host for `apps/native/dev-callback/`.
2. Serve `/auth/native/callback` and `/.well-known/assetlinks.json` without login, bypass tokens, or cross-host redirects. Keep protection on the existing application unchanged.
3. Generate Dev-only DAL using `NATIVE_DEBUG_SHA256` and `scripts/configure-auth.mjs`. Use package `com.addi.app.dev` and the actual test APK debug signing certificate. Never replace the Production DAL or Play signing settings.
4. In the existing **Dev Supabase project only**, allow the exact Native callback and its `?attempt=<64 hex>` query. Keep the host/path fixed; check a rule such as `https://<DEV_HOST>/auth/native/callback?attempt=*` against the actual redirect. Keep existing web redirects and Site URL unchanged.
5. Keep existing Dev Google/Kakao provider identities/configuration. The provider callback remains `https://<DEV_SUPABASE_REF>.supabase.co/auth/v1/callback`; it must not be replaced with the Native app callback.
6. Set ignored Native `.env.local` with the Dev publishable key and `VITE_NATIVE_AUTH_CALLBACK`, then rebuild the debug APK. Never store provider passwords or secret/service-role keys.

## Acceptance checklist for future rebuilds

- Android `pm get-app-links com.addi.app.dev` reports the actual Dev host as **verified**.
- Implicit HTTPS intents, without `-n` or manual link overrides, return to cold/foreground ADDI.
- Account owner enters Google/Kakao credentials directly in the system browser UI.
- Compare existing Dev web and Native user IDs privately; report only equality. Requery existing medication/mood/visit data without publishing identifiers or records.
- Verify actual new/existing login, cancel/back, restore/refresh/logout, account switch and existing web cookie login regression.

Existing Dev redirect entries were added during the earlier setup phase. No Dev/Production Auth configuration was changed during final acceptance. Private findings and personal identifiers are not published.

References: [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls), [Android App Links](https://developer.android.com/training/app-links/verify-applinks).
