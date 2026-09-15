# Phase 3 — Capacitor Native Push (Dev only)

## Scope and environment

- Branch: `feature/capacitor-native-push`, based on merged PR #90 (`1eac31a`).
- Android: `com.addi.app.dev`, label **아디**, version `0.2.1-prototype-dev` / code 6. Installs beside `com.addi.app`.
- Firebase: **ADDI / `addi-503b5`**, explicitly confirmed by the owner as the newly created Dev project. Only the Dev Android package was registered. An earlier empty GCP project (`addi-native-push-dev`) was not used.
- Supabase: **ADDI Dev / `ohobxicxchkaisxxswkk`** only.
- Auth callback remains `https://addi-galaxy-auth-dev.vercel.app/auth/native/callback`; debug SHA-256 certificate and existing Dev DAL are unchanged.
- Native API: `https://ohobxicxchkaisxxswkk.supabase.co/functions/v1/native-push`.
- The original Production cron, env, database, Firebase, Play Console, TWA, Web Push and DAL were not modified. No cron was installed or enabled for this prototype.

## Registration and lifecycle

`@capacitor/push-notifications` 8.1.2 handles Android permission and FCM registration. Firebase Messaging 25.0.1 is also a direct Android dependency for the native service. Google Services configuration is ignored by Git, and Gradle rejects another Firebase project or package. Release variants remain disabled.

A random installation UUID, 256-bit capability, revision, account binding, token and installation preferences are encrypted with AES-GCM and a non-exportable Android Keystore key. This storage is separate from the Phase 2 Auth session. No refresh token, FCM token or installation capability is written to localStorage or ordinary logs. Backup remains disabled.

- Registration and preference updates verify the Supabase Bearer with `auth.getUser`. The server derives ownership; submitted user IDs and extra fields are rejected.
- Settings default OFF. A new account binding must register with all settings OFF and obtain fresh consent. Native settings never copy, merge or modify Web settings.
- Resume/relaunch fetches the current SDK token and refreshes the registration. `onNewToken` updates encrypted native state and queues a capability-limited rotation job, including when JavaScript is absent.
- Logout clears the local binding before clearing Auth. Notification display/taps stop immediately; Android JobScheduler retries server revocation after offline logout. Token deletion does not delay clearing the Auth session, and subsequent token acquisition waits for that deletion task.
- Monotonic revisions reject late register/rotate/revoke requests from an earlier account. Rotation cannot grant ownership or enable preferences. Revoke can only disable an existing capability-matched installation.
- Reinstall generates a new installation/capability. Invalid FCM tokens are revoked only if the failed delivery still matches the current token hash and account binding.

`native_push_registrations`, `native_push_revocations`, `native_push_qa_target`, `native_push_test_runs` and `reminder_deliveries` are server-only: forced RLS, no `anon`/`authenticated` grants, no public RPC execution. Edge `verify_jwt=false` is intentional: authenticated operations perform their own Bearer verification, and maintenance accepts only a narrowly scoped installation capability. CORS permits `https://localhost` only; CORS itself is not authentication.

## Reminder policy and transport

The existing `lib/reminders/policy.ts`, Web sender, production cron route and original SQL functions remain byte-identical. Additive `_v2` SQL functions include Native-only users in both eligibility and candidate queries:

| KST | Policy |
|---|---|
| 08:00 | Visit D-1 and D-day, separate existing slots |
| 09:00 | Daily first; as-needed fallback |
| 11:00 / 13:00 | Daily |
| 15:00 | Mood |
| 21:00 | Bedtime |

The original `(user_id, reminder_date, reminder_slot)` claim remains the logical reminder identity. `reminder_deliveries` adds transport/target outcomes and token/binding snapshots. A successful target is not resent when another target retries. Only explicit 429/5xx responses retry at the existing +5/+15 minute offsets, maximum three attempts within 30 minutes. Unknown send outcomes are terminal. App notification history is recorded once on the first successful transport.

`runNativeAwareReminders` dispatches via separate Web/FCM adapters. The Node Web adapter reuses `sendWebPush`. The Dev Edge entry always disables Web sends and limits a manual scheduler invocation to the selected user and FCM installation. It does not replace the existing scheduler.

## Notification UX

Data-only high-priority FCM messages are validated and displayed by `NativeMessagingService`, independent of a WebView process. The service verifies installation, account binding, preference, kind/route, expiry and delivery deduplication before showing a notification.

- Native channel: `addi_reminders_v1` / 아디 리마인더.
- Android 13+ runtime notification permission.
- Existing B small-icon PNGs reused byte-for-byte from the TWA resource set.
- Generic existing reminder text; private lock-screen visibility.
- Explicit immutable `PendingIntent` opens `MainActivity`, never a browser.
- Medication → `/`, mood → `/moods/new`, visit → `/visits`.
- Pending taps are consumed after Auth restore and current-binding validation, for warm and cold starts.

The mood entry now renders the shared question flow. Its draft is account-scoped in memory; same-origin AI/API features still retain Phase 2's unavailable boundary. This phase does not add Native AI or other business API adapters.

## Dev QA send guard

A service-role administrator must select exactly one known Galaxy registration in `native_push_qa_target` with an expiry. The app cannot select or change recipients. Every test uses a one-shot request ID and a 30-second per-installation gate, and checks the installation preference before sending.

- App: `/dev/push`, linked below Native notification settings, uses the logged-in Bearer.
- Administrator: `/test-admin`, guarded by a separate server-only Dev QA secret and the same singleton/rate/one-shot checks. Request supports only `kind` and `requestId`.
- Manual scheduler: `/scheduler`, guarded by the Dev QA secret and singleton. It uses the real current clock and unchanged reminder windows; no arbitrary test timestamp.
- Never retry a request with a new ID after an unknown send outcome.
- No actual send is permitted to the emulator or other registered installations in this QA run.

## Build and deployment

1. Install root and `apps/native` dependencies from their lockfiles.
2. Provide the existing ignored Native Dev Auth settings and `apps/native/android/app/google-services.json` downloaded for the exact approved Dev Firebase Android app.
3. `npm --prefix apps/native run sync`.
4. With JDK 21 and Android SDK configured, run `./gradlew :app:assembleDebug :app:lintDebug` under `apps/native/android`.
5. `node scripts/build-native-push-edge.mjs` builds the Edge bundle from shared TypeScript. Deploy **only** `native-push` to ADDI Dev.
6. Server-only Edge secrets: `ADDI_DEV_FCM_CREDENTIAL` and `ADDI_DEV_PUSH_QA_SECRET`. The FCM service account is scoped to the Dev Firebase project. Never place a service account in Native files, Git, PR text or logs.

Migration `20260915115217_capacitor_native_push_dev.sql` was applied to ADDI Dev only. Its timestamp matches Dev migration history. Production migration requires a separate reviewed rollout.

Validation commands from the repository root:

```sh
npm --prefix apps/native test
node --experimental-strip-types --experimental-loader=./scripts/ts-test-loader.mjs --test scripts/native-push.test.mjs
npm run typecheck
npm run build
npm run reminders:fixtures
npm run notifications:fixtures
npm run push-e2e:fixtures
git diff --check
```

Android instrumentation uses `:app:assembleDebugAndroidTest` and `:app:connectedDebugAndroidTest` under `apps/native/android`, on an emulator with notification permission granted. The fixture deliberately rejects a physical device and the Production package. `scripts/native-push-db-qa.sql` is a rollback-only suite for ADDI Dev; never run it against Production.

Final Galaxy APK: `apps/native/qa-artifacts/phase3/ADDI-Dev-0.2.1-native-push.apk` (ignored artifact), SHA-256 `f97d8aaea0b6195910fbfb49d6f3b02b1fdc0d82de6e0d421964a4f6f93de7c1`. APK signature verification passed. Debug signing certificate SHA-256: `98:C3:7A:ED:32:25:C5:B2:D3:DA:42:D8:24:9D:F1:46:57:4A:C0:DE:2C:FC:E8:32:4F:17:AF:88:6C:D4:3D:B5`.

## QA evidence

### Automated and emulator

- Native typecheck/build/sync: PASS.
- Android debug build and app lint: PASS (existing resource/launcher warnings remain).
- Existing Auth and Native boundary tests: 28 PASS.
- New Push contracts/API/transport tests: 10 PASS.
- Real Dev Edge integration: synthetic authenticated users, registration, independent preferences, one-target send guard, logout, stale replay and account transfer PASS; zero FCM sends. Synthetic users were removed afterward.
- Dev SQL rollback suite: Native-only actual claims/deliveries for all seven slots, daily/PRN priority, per-target partial retry, one logical history record, ownership, rotation, revocation, stale requests and grants PASS. Synthetic users/data were rolled back.
- Android Keystore round trip/ciphertext, native notification small icon/attribution, duplicate/expiry/route/binding/preference guards: emulator instrumentation PASS.
- Offline logout: immediate local Push deactivation, Auth session removal without waiting for Firebase token deletion, and reload remaining signed out/inactive PASS.
- Native registration acknowledgement regression: Android represents small bridge JSON numbers as `Integer`; completion now validates generic `Number` instead of `PluginCall.getLong`. Emulator UI, encrypted preferences and server preferences all agree; local registration becomes active.
- Verified Dev App Link: `pm get-app-links` reports `verified`; implicit HTTPS VIEW resolves to `com.addi.app.dev/com.addi.app.MainActivity`.
- Existing Web build/typecheck and Web Push, settings, notification and reminder fixtures: PASS.
- Existing web Auth, cookie callback, Supabase browser/server clients, Web Push sender/client, PWA manifest, Service Worker, CSS, Production DAL and TWA manifest: byte-preserved against the base commit.
- Security advisor: Native tables are deliberately server-only with forced RLS and no public policies/grants (INFO); existing leaked-password protection warning was not changed.

### Galaxy — completed 2026-09-15

Evidence combines the user's physical Galaxy observations with the selected Dev registration and server send records. No Galaxy ADB connection or device trace was used. All physical results below use v0.2.1; v0.2.0 is superseded by the registration acknowledgement fix.

| Check | Result and evidence |
|---|---|
| Permission, registration and three preferences ON | PASS: user enabled notification permission/settings; server confirmed an active, authenticated Dev registration with all three preferences ON. |
| Foreground medication | PASS: one FCM request accepted; user confirmed receipt, **아디** attribution, status-bar icon and tap to Home without a browser. |
| Background mood | PASS: one FCM request accepted; user confirmed receipt and tap to the mood entry screen without a browser. |
| Recents-dismissed visit / cold tap | PASS: user dismissed the app from recent apps; one FCM request accepted; user confirmed receipt and tap to visits without a browser. This does not establish Android Settings Force Stop or a measured process-death state. |
| Three preferences OFF | PASS: user confirmed OFF; server values were all false. Three kind-specific test requests returned HTTP 409, with no additional send record or FCM transmission. The registration was also revoked at that observation, so active-registration per-preference isolation is supported by the automated/API checks, not this device observation alone. |
| Logout and restart | PASS: user confirmed the login screen remained after restarting. Local immediate deactivation and offline Auth removal also passed emulator QA. |
| Re-login and restart | PASS: user enabled the three preferences after re-login and confirmed login/settings persisted across restart. Private comparisons confirmed the same installation and authenticated owner, a new account-binding value, and active/all-ON server state. |
| Receipt after re-login | PASS: one additional mood FCM request accepted; user confirmed receipt and tap to the mood entry screen without a browser. |
| FCM token rotation | Server rotation/stale-revision integration checks PASS. The Galaxy token was unchanged in the before/after comparison; spontaneous SDK token rotation was not observed and is not claimed as a physical-device PASS. |

Exactly **four** actual FCM sends were made, all to the same explicitly selected Galaxy installation; all four have `sent` server results and user-confirmed receipt/routing. No automatic retries or other recipients were used. After QA, the singleton test target was expired to close the manual send window. Registration and user-selected preferences remain intact. No automated Dev scheduler was installed.

No user IDs, emails, raw tokens, capability values, session values or health records are included in this report.

## Production rollout risks / decisions

- Web and Native targets remain independent. If the same person enables both, the policy can deliver twice. SQL tests demonstrate two targets under one claim; this prototype never guesses that a Web endpoint and Native installation are the same phone.
- Before Production rollout choose an explicit, reversible channel preference/migration policy. Preserve Web-only/TWA users and require user consent before disabling a Web target. Do not infer ownership from email or device heuristics.
- Decide approved multi-device limits (currently up to four eligible targets per transport), expiry/retention and abandoned-installation cleanup.
- Approve Production Firebase/package/signing, server credentials, migration, scheduler cutover/rollback and duplicate-notification policy in a separate phase. None are part of this Dev change.
- Android settings **Force stop** blocks FCM until a manual launch. Test recents dismissal/process death separately. OEM battery restrictions and FCM high-priority delivery remain real-device acceptance gates.
- Data-only payloads are necessary to suppress an old account's delayed message locally. Galaxy foreground/background/recents-dismissed delivery passed; prolonged Doze, OEM battery restrictions and spontaneous SDK token rotation remain Play validation cases. Do not substitute automatic notification payloads that bypass the binding checks.

**Phase 3 result:** Native FCM Dev implementation and the physical Galaxy receipt/routing/settings/logout/re-login gate PASS. Proceeding to planning and validation of a Capacitor Play update is possible; Production migration, credentials, scheduler activation, Play upload and release still require separate authorization. PR #91 remains Ready for review and unmerged; required GitHub review must pass before the owner merges it.
