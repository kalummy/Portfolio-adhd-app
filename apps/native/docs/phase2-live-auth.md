# Public Dev Native Auth validation

A separate static Vercel project hosts `https://addi-native-auth-dev.vercel.app`. It contains no ADDI application screens, API functions, Supabase secrets, or user data. The original application's deployment/domain/protection settings are unchanged. The native debug app continues to accept only its existing Dev Supabase target.

## Galaxy Dev package update

The current debug build is `com.addi.app.dev` / `아디`, with a new fixed Galaxy callback host, `addi-galaxy-auth-dev.vercel.app`. Both public Dev DAL files target that package exclusively. The Galaxy host has its own static Dev project to avoid inherited Preview protection and the old host's cached DAL. See [Galaxy installation and acceptance](phase2-galaxy.md). The new package passed verified implicit cold/foreground App Link routing and Keystore round-trip; see `phase2-evidence/galaxy-dev-build.json`. The `com.addi.app` results below are historical.

## Public surface

- `/.well-known/assetlinks.json`: unauthenticated HTTP 200 JSON, no cross-host redirect.
- `/auth/native/callback`: unauthenticated HTTP 200 inert HTML, no scripts or reflected query values.
- `/`, `/auth/native/callback/index.html`, `/api/account`: HTTP 404.
- DAL package is now `com.addi.app.dev`, relation is `delegate_permission/common.handle_all_urls`. The certificate was extracted with `apksigner` from the final debug APK and matched against the public JSON. No Play certificate was substituted.

## Historical Android evidence (before the Dev package split)

`pm verify-app-links --re-verify com.addi.app` followed by `pm get-app-links com.addi.app` reports the Dev host as **verified**. Without an explicit component or manual link override, both a process-dead and foreground HTTPS intent resolve to `com.addi.app/.MainActivity`. The harmless probe has no OAuth code; this proves verified link routing, not provider authentication.

## Final real OAuth acceptance

The user subsequently completed Google/Kakao OAuth and session/callback QA on a physical Galaxy using the isolated Dev app. The existing Dev CLI session was reused during environment setup; no fresh CLI login is required. Current acceptance adds read-only Dev DB ownership checks and Native/Web regression, with no remote configuration changes.

See [final acceptance](phase2-final-qa.md) for the exact evidence sources and limits. Phase 2 passes for the tested existing Dev accounts. PR #90 remains Ready and unmerged; GitHub currently requires an approving review. Production, Play, TWA, Push and scheduler remain unchanged.
