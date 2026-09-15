# Phase 4 — Native core feature parity (Dev)

Status: implementation, live Dev CRUD and actual Native AI/save/detail/cold restore pass; Galaxy acceptance pending. See [AI 503 resolution and Galaxy handoff](phase4-ai-503.md).
No Production or Play deployment is authorized by this change.

## Architecture

- Bundled Vite/React screens use the existing CSS and web medication, mood, visit, profile and deletion components.
- Native repositories call the finite `/functions/v1/native-api/repository` contract. The Edge handler verifies the Bearer token with Supabase `auth.getUser`, rejects anonymous sessions, derives the owner, and injects that user's authenticated client into the existing repository factories. Both explicit owner filters and RLS remain in effect.
- Only medication/intake/mood/visit methods are exposed. Guest migration RPCs, arbitrary tables, arbitrary method names and client owner IDs are rejected. Requests are bounded to 96 KiB.
- Shared medication search/detail/manual-match/image verification and OpenAI mood provider functions are bundled into the Edge adapter. Web `/api/*` routes stay unchanged. The AI endpoint fails closed without a Dev secret; it never substitutes Preview/mock analysis for real AI.
- CORS admits only `https://localhost`. Non-browser test clients still require a valid Bearer session. JS and Android network allowlists permit only the Dev Supabase host and finite API routes. Cookies and URL tokens are not used.
- Mood analysis recovery is opt-in through `analysisRecovery` (Native only). It adds an explicit retry view and guards concurrent analysis requests; the web default remains false.
- Profile metadata updates retain the existing Supabase Auth identity. Account deletion reuses `deleteAuthenticatedAccount`; only that account's feedback/Auth record are removed, with existing database cascades. The Native cleanup clears Keystore Auth/Push binding and local drafts.
- Native Push remains the Phase 3 installation-owned registration/settings implementation. Web subscriptions, scheduler, Service Worker and TWA are unchanged.

## Runtime targets

| Item | Value |
| --- | --- |
| Supabase | ADDI Dev `ohobxicxchkaisxxswkk` |
| API | `https://ohobxicxchkaisxxswkk.supabase.co/functions/v1/native-api` |
| Android package | `com.addi.app.dev` |
| Version | `0.3.1-prototype-dev` / code 8 |
| OAuth callback | `https://addi-galaxy-auth-dev.vercel.app/auth/native/callback` |
| Firebase | existing Dev `addi-503b5` |

The server adapter explicitly rejects any other Supabase project. Existing Native build guards continue to disable release and reject non-Dev Firebase/callback inputs.

## Previous 0.3.0 artifact (preserved)

`apps/native/qa-artifacts/phase4/ADDI-Dev-0.3.0-native-parity.apk` (ignored build output)

SHA-256: `91642afe15a3c1eb45d3968421b415e1766abf35bc083dcc22383a6f6ddb7140`.
This debug APK updates only ADDI Dev; it cannot replace the Play package. Final live Dev/Galaxy acceptance remains pending.

## Implemented paths

- Medication: method → search or manual name/strength → confirmation → daily/as-needed/bedtime schedule → review/save; active list, schedule/time edit, soft deletion, intake/undo/recorded-time edit. Existing prescription photo UI is reused but OCR/camera is outside the requested QA matrix and is not yet claimed as supported.
- Mood: selected-date question flow → analysis → result → save; duplicate-date handling, history/detail, analysis failure/retry and save reconciliation.
- Visit: upcoming create/edit/delete with existing date validation.
- Account: profile selection, logout, account deletion UI. Social identity linking/unlinking remains outside this scope.
- Notifications: existing Native medication/mood/visit settings and FCM registration ownership.
- Native unsaved medication/mood drafts are cleared on account changes. Saved data lives in Supabase; no browser guest dataset is imported.

## Server secrets (Dev only)

Current AI transport uses `ADDI_DEV_AI_PREVIEW_BYPASS` only in Dev Edge Secrets. OpenAI executes with the existing Vercel Preview `OPENAI_API_KEY`; the direct Edge OpenAI variables below remain optional, unused in the verified relay path. See `phase4-ai-503.md` for scope and safeguards.

- `ADDI_DEV_MFDS_SERVICE_KEY`
- `ADDI_DEV_MFDS_PILL_IDENTIFICATION_SERVICE_KEY`
- `ADDI_DEV_OPENAI_API_KEY`
- optional `ADDI_DEV_OPENAI_MOOD_MODEL` (otherwise the shared web provider's default)

Values belong only in Dev Edge Secrets. They must not appear in the APK, repository, PR, URLs, screenshots or general logs. Existing Dev Supabase runtime credentials authenticate RLS queries; the service-role client is created only for the existing account-deletion workflow.

## QA status

| Check | Result |
| --- | --- |
| Native typecheck + bundled build | PASS |
| Android debug build + app lint | PASS |
| Native Auth/boundary tests | PASS, 28 tests |
| APK package/signing/App Link | PASS: `com.addi.app.dev`, existing debug signer, Dev domain verified |
| New API invalid input/origin/owner/method/body/Dev guard fixtures | PASS |
| Web typecheck + build | PASS |
| Web Google/Kakao cookie Auth, DAL, TWA, CSS, Web Push byte regression | PASS |
| Shared AI safety/provider retry, mood flow/ownership, deletion, reminder and Push fixtures | PASS |
| Emulator UI wiring fixture: manual medication/intake, visit create/edit, mood failure/retry/save, profile | PASS; synthetic API/AI responses, not live DB evidence |
| Live Dev repository/ownership/deletion integration | PASS: 8 groups including live search; disposable Dev accounts only |
| Emulator existing APK against live Dev API | PASS: 8 groups, no API mocks; synthetic Dev account, not Google/Kakao OAuth evidence |
| Live official medicine search | PASS: Dev server MFDS secrets registered and actual search returned results |
| Real Dev OpenAI analysis | PASS through authenticated Dev Edge → existing Preview Secret; actual APK 0.3.1 |
| Galaxy flows + Dev DB comparison | Pending user device testing with the existing APK 0.3.0 |

A pre-existing mood source assertion expected a literal `저장` child even though the current UI renders saving/retry/save states. The assertion was updated to cover those existing states; web UI behavior did not change.

## Resumed live QA (2026-09-15)

- Existing Supabase CLI credentials were read through the Mac Keychain with local user approval. No new login was started and no credential was printed.
- With explicit user authorization, the two existing MFDS keys were copied into the two Dev-only Edge Secret names above. Source values and Production configuration were unchanged. No existing Dev OpenAI secret was found.
- Real hosted QA exposed two adapter compatibility issues: the Edge gateway forwards `/native-api/*` after stripping `/functions/v1`, and it can supply an empty stream for a bodyless DELETE. Only those server checks were corrected. Unknown paths and non-empty deletion payloads remain rejected. Added fixtures cover both cases.
- Dev `native-api` version 5 contains those corrections. APK 0.3.0 and its SHA-256 remain unchanged; no app rebuild or feature refactor was performed.
- The live integration creates two disposable Dev accounts. Medication schedules/edit/deactivation, intake/idempotence/undo/time changes, visit CRUD, mood save/date/range/duplicate handling, owner isolation, profile identity, session refresh, MFDS search and account deletion pass. Admin DB readback confirms the expected owner and rows; deletion removes the Auth user and four owned health-data sets, and a stale session is rejected. The test accounts are cleaned afterward.
- Native/Web typechecks, all 28 Native tests, deletion, reminder and notification fixtures pass again. Protected Web Auth/API, TWA, Native/Web Push paths are unchanged. No FCM messages were sent.
- Existing APK 0.3.0 also passed live Dev emulator UI QA: manual medication/save, intake/undo, upcoming visit create/edit, profile, process-stop/relaunch session and data restore, logout/Keystore clearing, signed-out relaunch, same-account data on re-login, and disposable-account deletion. No API responses were mocked. The QA waits for asynchronous Keystore cleanup completion before checking the signed-out state. The synthetic account was deleted after testing.
- At that earlier checkpoint, real AI was blocked on the missing Edge secret. This is now resolved through the existing Preview key; see `phase4-ai-503.md`. Galaxy acceptance remains separate.

## Galaxy acceptance matrix (do not delete the real Dev account)

1. Upgrade only `com.addi.app.dev`. Verify existing Google/Kakao Dev sign-in and prior records.
2. Search/add a clearly designated QA medication; test all three schedules, modify schedule/time, take/undo/time edit, and deactivate. Confirm the matching Dev rows privately.
3. Write a synthetic mood entry on an unused date, request actual AI, save, reopen by date. Exercise failure/retry without replacing pre-existing mood rows.
4. Register/modify/delete a designated QA upcoming visit only after preserving any existing value. Compare the Dev row privately.
5. Change profile and Native notification settings; compare installation settings without reading or logging FCM tokens.
6. Close/relaunch; verify saved records/session/settings; logout and sign back in; ensure ownership stays with the same account.
7. Delete only an explicitly disposable Dev test account after creating synthetic records. Verify removal of Auth and its owned records, Keystore clearing, and signed-out relaunch.

Never publish email, user ID, token, or health-record contents as evidence. Record booleans/counts and transport/status outcomes only.

## Remaining Production/Play blockers

This change does not enable a Production API gateway, Production OAuth callback/allowlist, Production Firebase, Native Push schema/env/scheduler, Web/Native delivery selection, or Play migration. Each remains a separate approval and verification step. No migration or FCM send occurs in this change.
