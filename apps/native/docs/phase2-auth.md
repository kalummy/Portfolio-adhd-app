# Phase 2 Native Auth — implementation and verification

Base: merged PR #89, `77efdd9f8d3761ebc210238a09409dbefc618b7a`.
Branch: `feature/capacitor-auth`. No merge, Production deployment, or Play operation is part of this change.

## Current verdict

**Actual provider OAuth acceptance is NOT complete.** A separate static Dev callback project is now live at `https://addi-native-auth-dev.vercel.app`. Android reports this host as **verified**, and implicit HTTPS intents open ADDI in both cold and foreground cases without `-n` or manual link approval. The callback probe does not exchange an OAuth code. Existing CLI authentication has now read Dev Auth settings and added only the two Native redirect entries while preserving the five existing web entries and all other settings. Account-owner Google/Kakao UI login is pending. No Production configuration was changed. See [live environment status](phase2-live-auth.md).

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

## Dev setup (remote settings unchanged)

1. Use the existing ADDI Dev project `ohobxicxchkaisxxswkk`. Its public settings were read: **Google enabled, Kakao enabled**. Production project is never accepted by Native config or transport.
2. Provision/select a dedicated **public HTTPS Dev host**. Serve `apps/native/dev-callback/` there; the native callback is `/auth/native/callback`. This directory is a standalone static host, not an alteration of web `/auth/callback`. Callback HTML does not exchange tokens, reflect query parameters, run scripts, or load trackers.
3. Set `.env.local` from `.env.example` in `apps/native` with the Dev publishable key and exact callback URL. This file is ignored. Never put service-role/secret keys here. `addi-gamma.vercel.app` is rejected by the prototype configuration.
4. Set `NATIVE_DEBUG_SHA256` to this **debug** APK's certificate and run `node scripts/configure-auth.mjs`. It generates an ignored **Dev-only** `.well-known/assetlinks.json`. Publish only to the dedicated Dev host; never replace root `public/.well-known/assetlinks.json`.
5. In **Dev Supabase only**, allow the exact callback path and its `attempt` query form. Verify the redirect allowlist rule matches query parameters without broad domain wildcards. Use the existing Google/Kakao provider configuration; provider callback stays the Dev Supabase `/auth/v1/callback`. No Production setting is needed for this step.
6. `npm run sync`, then `npm run android:debug` with JDK 21 / SDK 36. Release variants remain disabled. The manifest uses the generated host and **exact callback path**, HTTPS, `autoVerify`, and `singleTask`.
7. Confirm `adb shell pm get-app-links com.addi.app` reports **verified** for the actual Dev host. An explicit component launch, user-selected link override, or a mocked callback is insufficient evidence. Public DAL must be reachable without Preview protection.
8. Use only the disposable emulator/test identities. Google/Kakao credentials should be entered by the account owner, never placed in scripts or chat.

`com.addi.app` remains the application ID; this debug app is not a parallel-install production product. Do not install it over the Play/TWA app on a real device. No release signing settings or Play fingerprints are modified.

## Production DAL

The live `https://addi-gamma.vercel.app/.well-known/assetlinks.json` was downloaded read-only and matched the repository file byte for byte. Package `com.addi.app` and both existing SHA-256 entries remain intact:

- `76:2F:82:83:36:A5:16:12:38:48:1F:12:D0:82:40:12:49:CF:36:B5:C4:96:55:88:74:22:6B:43:0D:1C:E7:90`
- `47:D7:85:98:D0:5A:77:6F:21:67:50:0F:16:26:38:06:27:9F:06:58:E6:E3:78:92:E0:61:E0:E9:96:A1:29:14`

Their current Play Console signing-key identities were **not reverified**. Google's official DAL API returned **linked: true for both entries** after an initial transient approval-tool capacity error. Existing repository documentation also distinguishes upload certificates from Play app-signing certificates. No conclusion about a debug certificate's Production association follows from these entries.

## QA evidence

| Check | Result |
|---|---|
| Native typecheck + Vite build/sync | PASS |
| Node unit/integration/boundary tests | 28 PASS (including real Supabase SDK with synthetic HTTP) |
| Original Next.js typecheck + production-mode build | PASS locally; no deployment |
| Web Google/Kakao start functions, `/auth/callback`, cookie clients, CSS, DAL, TWA | Byte-preservation checks PASS; actual web OAuth not exercised |
| Android `assembleDebug`, `testDebugUnitTest`, `lintDebug` | Compiled debug build PASS; lint PASS after API 27 theme resource separation; no authored Java unit tests |
| Secure adapter write/read, ciphertext on disk, process kill/restart | PASS on Android 16/API 36 disposable emulator |
| Login UI at 360 / 390 / 430 | PASS on emulator |
| Google foreground callback, matching SDK verifier, profile, duplicate rejection | PASS with synthetic server responses on emulator |
| Cancellation clears pending attempt | PASS on emulator |
| Kakao callback, logout, session restore, expired session refresh, account switch, fixture record requery | PASS with synthetic server responses on emulator |
| Cold callback / offline logout / actual Browser surface final regression | PASS on final APK: explicit cold intent, Wi-Fi/data disabled logout, actual Chrome Custom Tab/back; synthetic Auth responses, no verified domain |
| Wrong host/path, expiry, provider denial and explicit cancel | PASS on emulator; durable pending attempt inspected and exchange count asserted |
| Real Google new/existing, real Kakao new/existing | NOT VERIFIED: Dev callback hosting/allowlist and account-owner login needed |
| Existing real user_id / existing real records | NOT VERIFIED; synthetic identity assertions are not Production evidence |
| Verified HTTPS App Link domain + implicit cold/foreground routing | PASS on the public Dev host; probe only, real provider code exchange pending |
| KakaoTalk return | NOT VERIFIED |
| Real refresh/restart/logout/account switch | NOT VERIFIED; SDK refresh/persistence/logout behavior is covered with synthetic transport |
| Physical Galaxy / other Android versions | NOT VERIFIED |

The default build has no Dev callback credentials and does not enable OAuth. The experimental emulator APK was built with reserved `addi-auth-qa.example.com` and a synthetic publishable key; it is not a distributable auth build. Final APK reassembly, signature/compiled manifest verification, and all 18 emulator Auth groups now PASS. The new run verified actual disconnected logout after disabling emulator Wi-Fi/data and observing a failed network probe. Earlier retries exposed QA harness issues: `am start -W` installed synthetic response interception too late; assigning `Browser.open` did not override the Capacitor Proxy and could leave Chrome first-run UI in front. The harness now connects immediately, stubs only Browser calls at the nativePromise bridge, foregrounds ADDI, and explicitly rejects Chrome FirstRunActivity as browser QA evidence. Keystore/App calls remain real native operations. No product Auth behavior changed during this QA follow-up. The earlier approval capacity error did not recur on the successful build/emulator run. Raw test tokens and full callback URLs are not committed as evidence.

## Earlier 2026-09-15 fixture APK and discovery (before public Dev hosting)

- Vercel API (existing CLI authentication) confirms Preview/Development use ADDI Dev. The connected MCP returned permission errors; these were not treated as deployment failure.
- The existing branch-stable Preview alias requires deployment authentication for both DAL and callback. No suitable public Dev-only host was found. Existing deployment protection remains unchanged.
- Existing Dev identity/data discovery used read-only queries. Results and environment details are kept in a local private report. Live Native identity equality/data access remains unverified.
- Dev redirect allowlist contents remain unverified; the dashboard UI tool failed to start and the available Supabase connector does not expose Auth configuration. No allowlist/provider settings were changed.
- Debug APK SHA-256: `5f3359c1834a4cc5cf503f22b2a549bff4002d102b42773933e1585a79fb839d`.
- `apksigner verify` PASS; compiled package `com.addi.app`, target 36, min 24, backup disabled, cleartext disabled, exact synthetic HTTPS callback path.
- Emulator `pm get-app-links`: synthetic host state `1024`, **not verified**. Never use a manual link override to call this PASS.
- Public evidence: [18 emulator groups](phase2-evidence/emulator-final.json), [Custom Tab screenshot](phase2-evidence/system-browser.png). Exact Dev settings and certificate JSON remain in the local report.
- Source checkout: all 197 snapshotted file hashes and original short status remain unchanged. This follow-up changes only Native QA scripts and documentation/evidence. No merge, Production/Play, DB mutation, provider configuration, scheduler, Push, or Web Push operation.

## Remaining acceptance sequence

Public Dev hosting and Android domain verification are now complete. See [App Link evidence](phase2-evidence/app-links-verified.json). Dev allowlist verification is complete; continue with account-owner provider authentication.

For each Google and Kakao test identity: first sign into the existing Dev web app, record the user ID privately, then sign into Native with the same provider identity and compare exact IDs. Requery an existing synthetic Dev record through the Native repository; do not copy Production users or compare IDs across different Supabase projects. A genuinely new test account needs separate first-login verification. Test cancellation/back, explicit cancel after Kakao external-app handoff, replay, expiry, bad host/path/query, cold and foreground links, process death, expiration/refresh, offline logout and switching accounts. Retest web login separately with its cookie callback.

Before Play: validate the actual Play signing certificate/DAL, route handling when replacing the TWA package, key/storage upgrade policy, real provider flows, provider linking policy, and Android versions supported in practice. Production redirect/DAL/env changes remain a separate approval. **Phase 3 Push should wait until these Auth acceptance checks pass.**

## References

- [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [Native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
- [Capacitor Browser](https://capacitorjs.com/docs/apis/browser)
- [Android App Link verification](https://developer.android.com/training/app-links/verify-applinks)
- [Android Keystore](https://developer.android.com/privacy-and-security/keystore)
