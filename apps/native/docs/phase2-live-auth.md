# Public Dev Native Auth validation

A separate static Vercel project hosts `https://addi-native-auth-dev.vercel.app`. It contains no ADDI application screens, API functions, Supabase secrets, or user data. The original application's deployment/domain/protection settings are unchanged. The native debug app continues to accept only its existing Dev Supabase target.

## Public surface

- `/.well-known/assetlinks.json`: unauthenticated HTTP 200 JSON, no cross-host redirect.
- `/auth/native/callback`: unauthenticated HTTP 200 inert HTML, no scripts or reflected query values.
- `/`, `/auth/native/callback/index.html`, `/api/account`: HTTP 404.
- DAL package is `com.addi.app`, relation is `delegate_permission/common.handle_all_urls`. The certificate was extracted with `apksigner` from the final debug APK and matched against the public JSON. No Play certificate was substituted.

## Android evidence

`pm verify-app-links --re-verify com.addi.app` followed by `pm get-app-links com.addi.app` reports the Dev host as **verified**. Without an explicit component or manual link override, both a process-dead and foreground HTTPS intent resolve to `com.addi.app/.MainActivity`. The harmless probe has no OAuth code; this proves verified link routing, not provider authentication.

## Pending real OAuth acceptance

The next required input is the account owner's normal Supabase CLI/browser login to read the Dev redirect allowlist before making a minimal addition. No Auth settings have been changed yet. Once that is complete, verify real Google/Kakao login, existing identity equality and record reads, restore/refresh/logout/account switch, cancellation and cold/foreground callbacks. Credentials must be entered directly in the login UI and never published in test evidence.

PR #90 must remain unmerged. Real provider OAuth and Phase 2 acceptance are still incomplete. Production, Play, TWA, Push and scheduler remain unchanged.
