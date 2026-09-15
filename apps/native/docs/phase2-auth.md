# Phase 2 Native Auth — architecture and acceptance

Base: merged PR #89, `77efdd9f8d3761ebc210238a09409dbefc618b7a`.
Branch: `feature/capacitor-auth`; PR #90 remains Ready and unmerged.

## Current verdict

**Phase 2 Native Auth: PASS for the tested existing Dev accounts.** The user completed physical Galaxy Google/Kakao OAuth, browser/Kakao return, existing-data access, restore/refresh/logout/relogin, and cold/foreground callbacks. Current Dev DB comparison preserves every pre-QA provider/user mapping and record count, with no new mapping or duplicate-provider-subject evidence. Native/Web regression passed again.

See [final QA, evidence limitations and Phase 3 readiness](phase2-final-qa.md) and [machine-readable summary](phase2-evidence/final-acceptance.json). Real-device results are user-reported; emulator and automated evidence are identified separately. A new physical-device token/ID extraction was not performed. No personal identifiers, tokens, account hashes or health records are published.

Current build: `com.addi.app.dev` / **아디**, version code 4 / `0.1.3-prototype-dev`; callback `https://addi-galaxy-auth-dev.vercel.app/auth/native/callback`. It installs beside the Play/TWA package and accepts only ADDI Dev Supabase. GitHub requires one approving review before merge; no merge or Production/Play release is authorized by this acceptance report.

## Architecture

- Bundled Vite/React entry remains at `https://localhost`; no `server.url`.
- Native `signInWithOAuth` uses the existing Supabase SDK version 2.112.3, `flowType: 'pkce'`, and `skipBrowserRedirect: true`. SDK-generated S256 verifier and per-flow slot are written through the Android secure adapter **before** opening the system browser.
- A separate random 256-bit attempt ID is appended to the exact HTTPS callback. Pending attempt includes provider, SDK flow ID and creation time. A serialized controller durably consumes it before `exchangeCodeForSession(code, { flowId })`. No cookie sharing assumption.
- `@capacitor/browser` 8.0.2 uses Android Custom Tabs. Remote top-level WebView navigation stays blocked. Kakao app switches do not cause an immediate cancellation solely because the Custom Tab becomes hidden.
- `App.appUrlOpen` handles foreground callbacks; `App.getLaunchUrl()` handles cold callbacks. Only the exact configured HTTPS origin/path, matching attempt, non-duplicate allowed parameters, and a valid non-expired code are accepted. Unrelated callbacks do not erase a legitimate pending attempt. Attempts expire after five minutes or on explicit cancellation; consumed callbacks cannot retry, including after network failure.
- `detectSessionInUrl: false`, Capacitor `loggingBehavior: 'none'`, SDK `debug: false`, generic UI errors. Code/verifier/token values are never written by application logging. Test transport uses explicitly synthetic strings only.
- `lib/auth/profile.ts` contains the **unchanged** original `ensureUserProfile` function. `lib/auth/server.ts` re-exports it for existing web callers. Native calls it only with a user verified by Supabase `getUser()`. No email matching, account creation, manual merge, linkIdentity, or unlinkIdentity calls are added.
- A profile-row creation indicator is distinct from account creation. There is no new email/timestamp-based signup heuristic; the existing web callback did not contain a separate account-creation classification branch. Authoritative account identity remains Supabase `auth.users.id`.

## Session and data ownership

`AddiSecureStoragePlugin` uses AES-256-GCM with random IVs, storage-key authenticated data (AAD), a non-exportable AndroidKeyStore key, and synchronously committed ciphertext in private SharedPreferences. It has no web/plaintext fallback. Backup and device transfer are excluded. Hardware-backed/StrongBox availability is device-dependent and is not claimed from emulator testing.

The same adapter stores both PKCE material and the complete Supabase session. Restoring/refreshing the session verifies the user and prepares the profile before authenticated UI mounts. Foreground starts Supabase auto-refresh; background stops it. Logout unmounts account UI immediately, signs out the current Native session (`scope: 'local'`), clears Native storage, and then permits another login. Server-side revocation cannot be guaranteed while offline, but local credentials are removed. Storage failures fail closed.

Native authenticates directly to the **existing ADDI Dev Supabase** Data API using the SDK's Bearer token and existing RLS. Existing repository factories/mappers are reused through a Native-only client alias; each repository acquisition and read verifies the current user. Phase 2 exposes read methods only. Health-record writes, fixture migration, API/AI/search/account deletion transports remain unavailable. Authenticated UI is keyed by user ID so account changes unmount previous in-flight screen state. There is no new CORS policy or cookie API change.

Phase 1 synthetic member/data are removed from the Auth path. Mood entry/edit routes are unavailable in this read-only Auth verification phase, so fixture drafts do not become authenticated health records. The existing web guest cleanup hook is a Native no-op: Native has no claimed web IndexedDB dataset to restore. Push remains an unavailable Phase 3 boundary.

## Dev environment and build

The existing ADDI Dev Supabase project and providers are reused. The separate public static callback host serves inert callback HTML and Dev-only DAL. Current public paths return HTTP 200, and Android reports the Dev package's domain as verified. The APK certificate matches the public Dev DAL. Web `/auth/callback` is unchanged.

Use [current Dev setup](phase2-dev-setup.ko.md) and [Galaxy installation instructions](phase2-galaxy.md). Production hosts/projects are rejected by the prototype's configuration; secret/service-role keys must never be bundled. Release variants remain disabled. Existing Dev allowlist additions were made in the earlier environment-preparation phase; this final acceptance pass changed no remote Auth configuration.

## QA and retained history

- Final: [real-device report, current regression, ownership comparison and merge gate](phase2-final-qa.md).
- Earlier synthetic Auth edge cases: [18 emulator groups](phase2-evidence/emulator-final.json). These are not real provider-login evidence.
- Dev package verified App Links: [Galaxy Dev build checks](phase2-evidence/galaxy-dev-build.json). Its original NOT_RUN real-device field describes the earlier build-preparation date.
- Public Dev hosting: [environment record](phase2-live-auth.md).
- Layout/splash and Figma launcher: [Galaxy update record](phase2-galaxy.md).

Before Production/Play: separately validate fresh-account first login, identity linking policy, supported Android versions, Play signing/DAL, TWA package transition and release storage upgrades. Those release gates do not block starting isolated Phase 3 Dev implementation. Web Push, Service Worker, subscriptions, scheduler and TWA remain unchanged.

## References

- [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Capacitor Browser](https://capacitorjs.com/docs/apis/browser)
- [Android App Link verification](https://developer.android.com/training/app-links/verify-applinks)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
