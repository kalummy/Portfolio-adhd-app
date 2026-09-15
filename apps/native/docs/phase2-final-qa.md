# Phase 2 Native Auth — final Dev acceptance

Checked: 2026-09-15. Implementation under test: `93eabdc262b219c5aec6335e61613bd1e01c9fc7`; subsequent acceptance commit changes documentation only. PR #90 remains unmerged.

## Verdict

**Phase 2 Native Auth: PASS. Phase 3 Dev Native Push implementation readiness: YES.** This accepts the existing-account Native Auth scope using the account owner's Galaxy results, existing emulator evidence, current automated regression, and read-only Dev ownership checks. It is not Production/Play release approval.

Environment: `com.addi.app.dev` / **아디**, ADDI Dev Supabase, callback `https://addi-galaxy-auth-dev.vercel.app/auth/native/callback`. Latest delivered APK: version code 4 / `0.1.3-prototype-dev`. The user did not independently report an installed build number or Android/One UI version; do not infer these from their QA statement.

## Real Galaxy QA — reported by the account owner

| Scenario | Result | Evidence source |
|---|---|---|
| Actual Google login with an existing Dev account | PASS | User-confirmed physical Galaxy test |
| Actual Kakao login with an existing Dev account | PASS | User-confirmed physical Galaxy test |
| System browser / Kakao authentication returns to Dev app, without remaining in browser UI | PASS | User-confirmed physical Galaxy test |
| Existing account medication/mood/visit data is available | PASS | User-confirmed physical Galaxy test; Dev DB cross-check below |
| Process exit/relaunch restores login | PASS | User-confirmed physical Galaxy test |
| Session refresh | PASS | User-confirmed physical Galaxy test |
| Logout, relaunch signed out, and login again | PASS | User-confirmed physical Galaxy test |
| Cold-start callback and foreground callback | PASS | User-confirmed physical Galaxy test |

These are user-reported real-device results, not newly agent-operated OAuth runs. No credentials, full callback URLs, personal identifiers, account hashes, tokens, or health content are included in this report.

## Existing identity and ownership — read-only ADDI Dev checks

- Compared the private pre-QA baseline against current Google/Kakao provider-to-user mappings using temporary one-way ID comparisons. Every baseline mapping is preserved, and no additional provider/user mapping appeared since that baseline.
- Medication, mood and visit row counts for each baseline account are unchanged. Every checked account retains its profile.
- Duplicate provider-subject groups linked to multiple users: **0**. Orphaned social identities and orphaned medication/mood/visit owners: **0**.
- RLS is enabled on profiles, medications, moods and visits. SELECT policies restrict records to `auth.uid() = user_id` (profile: `auth.uid() = id`). Native repositories also use the server-validated user's ID and have no fixture fallback for authenticated account data.
- **Conclusion: existing identity/user ownership is preserved for the tested Dev accounts; no duplicate-account evidence was found in this comparison.** This combines the owner's successful existing-data reads, unchanged Dev mappings, and ownership policies. It does not claim a fresh direct extraction/comparison of the physical device's session ID, a row-content checksum, or proof covering every possible future account.
- The baseline stores provider/user pairs, not historical provider-subject values. The duplicate-subject check is a current DB integrity check. Different social identities belonging to the same human cannot be inferred or merged from this evidence. Application code does not use email for identity decisions or introduce `linkIdentity`/`unlinkIdentity`.

All queries were SELECT-only against ADDI Dev. No SQL, Auth configuration, allowlist, provider console, or data mutation was performed in this acceptance pass.

## Current regression

| Check | Result |
|---|---|
| Native TypeScript + Vite build + Capacitor sync | PASS |
| Native Auth/SDK/boundary tests | **28/28 PASS** |
| Android `assembleDebug` and `lintDebug` | PASS |
| Existing Next.js `npm run typecheck` and `npm run build` | PASS; local build only |
| Web Google/Kakao start, cookie callback/clients, profile helper | PASS: baseline byte/behavior-preservation assertions |
| Existing web CSS, DAL, TWA, API and DB paths | PASS: protected-path/diff-scope checks |
| `git diff --check` | PASS |
| Public Dev DAL and callback | HTTP 200, exact URL, debug certificate / Dev package match |
| Current emulator `pm get-app-links com.addi.app.dev` | Dev host **verified** |

The profile helper is extracted unchanged and re-exported for web callers. Existing web OAuth was not manually re-run in a browser during this acceptance pass; the web conclusion is based on unchanged login/cookie code, tests and successful build.

Earlier evidence remains distinct: [18 emulator groups](phase2-evidence/emulator-final.json) used synthetic provider responses for callback/profile/session edge cases; [Dev package evidence](phase2-evidence/galaxy-dev-build.json) verified real implicit cold/foreground App Link routing and Keystore operations. Together these cover replay, expiry, malformed host/path, cancellation/back, account switch, offline local logout, ciphertext storage, and process restart. The Galaxy statement adds actual provider OAuth, real session behavior, and existing-data access. Historical evidence files retain their original dates/statuses.

Existing toolchain warnings (Node experimental modules/type stripping, Vite chunk size, Gradle flatDir/deprecation) remain warnings; all requested commands exited successfully.

## PR / release status

- Ready (not draft), no merge conflicts at the checked main baseline.
- QA/implementation gate: PASS.
- GitHub currently requires **one approving review**, with `REVIEW_REQUIRED` / `BLOCKED`. Therefore **merge now: NO** under the current repository rules; once that review requirement is satisfied, no Phase 2 QA blocker remains. Do not bypass repository rules.
- No merge, Production deployment/configuration/migration, Play/Alpha operation, Push send, or scheduler change in this pass.

## Remaining before a Production / Play transition

Fresh-account first login, social linking/unlinking policy, additional Android/One UI versions, actual Play signing/DAL and package transition from TWA, and release storage/backup/upgrade behavior need their own release validation. Current build intentionally accepts only Dev Supabase and disables release variants. Offline logout removes local credentials; immediate server revocation is not guaranteed without a connection. Keystore hardware backing is device-dependent.

## Phase 3 readiness — structure only

Current boundary: `NativePushAdapter.register/unregister` is unavailable, Native API transport is unavailable, and the existing reminder route/repository/send function are Web Push-specific. No FCM dependency or service has been added.

Prepare in an isolated Dev phase:

1. Select a Dev Firebase project and register `com.addi.app.dev`; pin the supported Android/Capacitor messaging SDK and confirm its current registration API. Auth remains Supabase. Prepare server-only FCM sending credentials and Dev configuration without exposing credentials in the app or Git.
2. Add a narrowly scoped HTTPS Native registration API that verifies a Supabase Bearer token and derives the owner from the validated user. Never trust a body-supplied user ID or a broad CORS exception. Existing cookie APIs remain intact.
3. Plan separate Native registration storage with owner, installation/environment, updated timestamp and revocation state. Handle registration rotation, logout/account switch, offline removal/retry, stale targets and reinstall. Review any future Dev migration separately before applying it; no migration in this pass.
4. Reuse reminder eligibility/content and claim/finalization rules through a separate Native delivery adapter. The current subscription type and repository are Web Push-specific; changing only the send function is insufficient. Define per-transport/installation idempotency, retry outcomes and coexistence rules before integrating FCM, so one successful channel cannot hide a failed channel or create unintended duplicate reminders.
5. Implement notification permission, channels, denied-permission behavior, foreground/background display and authenticated tap routing. Use minimal non-sensitive payloads. Test one explicit Dev target before any scheduler integration.
6. Preserve Web Push, `push_subscriptions`, Service Worker, PWA manifest and current TWA delivery. Any Production migration, scheduler rollout, FCM send or Play operation remains outside this acceptance pass.

FCM registration and permission details must follow the selected SDK's current [Android setup](https://firebase.google.com/docs/cloud-messaging/android/get-started) and [registration lifecycle guidance](https://firebase.google.com/docs/cloud-messaging/manage-tokens). Phase 3 readiness authorizes a technical next step only; this report performs no Push implementation or send.
