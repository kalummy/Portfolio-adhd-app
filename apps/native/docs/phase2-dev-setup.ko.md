# Dev OAuth acceptance setup

The existing Preview callback/DAL endpoint requires deployment authentication. No suitable public Dev-only callback host was found. Production was not used as a fallback. Actual OAuth/App Link acceptance remains blocked.

## Required Dev configuration

1. Provide a fixed, public, Production-independent HTTPS Dev host for `apps/native/dev-callback/`.
2. Serve `/auth/native/callback` and `/.well-known/assetlinks.json` without login, bypass tokens, or cross-host redirects. Keep protection on the existing application unchanged.
3. Generate Dev-only DAL using `NATIVE_DEBUG_SHA256` and `scripts/configure-auth.mjs`. Use package `com.addi.app` and the actual test APK debug signing certificate. Never replace the Production DAL or Play signing settings.
4. In the existing **Dev Supabase project only**, allow the exact Native callback and its `?attempt=<64 hex>` query. Keep the host/path fixed; check a rule such as `https://<DEV_HOST>/auth/native/callback?attempt=*` against the actual redirect. Keep existing web redirects and Site URL unchanged.
5. Keep existing Dev Google/Kakao provider identities/configuration. The provider callback remains `https://<DEV_SUPABASE_REF>.supabase.co/auth/v1/callback`; it must not be replaced with the Native app callback.
6. Set ignored Native `.env.local` with the Dev publishable key and `VITE_NATIVE_AUTH_CALLBACK`, then rebuild the debug APK. Never store provider passwords or secret/service-role keys.

## Remaining acceptance

- Android `pm get-app-links com.addi.app` reports the actual Dev host as **verified**.
- Implicit HTTPS intents, without `-n` or manual link overrides, return to cold/foreground ADDI.
- Account owner enters Google/Kakao credentials directly in the system browser UI.
- Compare existing Dev web and Native user IDs privately; report only equality. Requery existing medication/mood/visit data without publishing identifiers or records.
- Verify actual new/existing login, cancel/back, restore/refresh/logout, account switch and existing web cookie login regression.

Exact local environment findings and debug DAL are kept out of the public PR. No Dev/Production Auth settings were changed during discovery.

References: [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls), [Android App Links](https://developer.android.com/training/app-links/verify-applinks).
