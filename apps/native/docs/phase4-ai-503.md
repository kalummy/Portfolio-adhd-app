# Phase 4: Native AI 503 resolved (Dev only)

## Confirmed cause

The unchanged 0.3.0 APK issued `POST https://ohobxicxchkaisxxswkk.supabase.co/functions/v1/native-api/moods/analyze` from the actual emulator WebView UI. Authorization Bearer was present, Cookie absent, Origin `https://localhost`, Content-Type `application/json`. The synthetic request used `{input:{date,recordedAt,hasMedicationIntake,evidence}}`, with three evidence entries. The response was HTTP 503 with `{code:"AI_NOT_CONFIGURED",failure_type:"configuration_error"}`.

The deployed Dev function version 5 was inspected directly. Its `index.js` bound `openaiKey` exclusively to `ADDI_DEV_OPENAI_API_KEY`, absent in Dev Edge Secrets. The handler authenticated the user and validated the body before returning that exact error. It never reached OpenAI or Vercel. Invalid Bearer returns 401; denied Origin returns 403; an incorrect Supabase environment returns a different `ENVIRONMENT_DISABLED` code. Thus A/C (separate execution environment and missing binding) caused the failure; B/D/E did not.

| Layer | Successful Web Preview QA | Native before fix | Native after fix |
| --- | --- | --- | --- |
| Client URL | Preview `/api/moods/analyze` | Dev Supabase `/functions/v1/native-api/moods/analyze` | Same Dev Supabase URL |
| App authentication | Supabase SSR cookie | Dev Bearer, `getUser` | Same Bearer, verified again at Preview |
| Origin / cookies | Same-origin Web / session cookie | `https://localhost` / no cookies | Unchanged; relay has no Origin/cookie |
| Execution / key | Vercel Preview / existing `OPENAI_API_KEY` | Supabase Dev Edge / missing `ADDI_DEV_OPENAI_API_KEY` | Dev Edge → Preview `/api/native/moods/analyze` / existing Preview key |
| Result | 200, real `gpt-5-mini` | 503 before provider | 200, real `gpt-5-mini` |

The original successful Preview runtime requests were 400 for invalid input and 200 for valid analysis. Final Native and Preview logs share correlation ID `11e25267-819c-44ad-aded-b061e9dcc5dd`: Edge `relay_start` → Preview `provider_start` → `provider_success` → Edge `relay_success`; client status 200. See the metadata-only evidence JSON files. No request content, user identifiers, access tokens, or credentials are logged.

## Minimal fix and boundaries

- `lib/native-api/preview-ai.ts`: server-only relay to a fixed PR #92 Preview origin and AI path. No caller-selected destination, no redirects, 45-second timeout, 32 KiB response cap, shared result validation, no mock success, sanitized failures. Upstream authentication failures remain 401.
- `lib/native-api/server.ts` and Dev Edge entry/bundle: optional authenticated AI relay; all other repository routes, ownership/RLS, body validation and CORS remain unchanged. Dev `native-api` version 6 is deployed.
- `app/api/native/moods/analyze/route.ts`: reuses existing Bearer verification and OpenAI provider. Requires both `VERCEL_ENV=preview` and the exact Dev Supabase URL. It has no admin operations and fails closed outside Dev Preview.
- `proxy.ts`: only the new exact path bypasses cookie routing, because it performs its own Bearer authentication. Existing Web cookie routes and `/api/moods/analyze` are unchanged.
- An actual Vercel runtime check caught a NextRequest/private-state incompatibility. The adapter now constructs a Request using explicit method/headers/body/duplex fields. Hosted validation and actual provider execution subsequently passed.
- `ADDI_DEV_AI_PREVIEW_BYPASS` is a **transport credential**, stored only in Supabase Dev Edge Secrets. It reuses an existing Vercel automation protection credential. Its Vercel scope is project-wide, so the server code deliberately fixes the sole outgoing Preview URL and forbids redirects. It never enters the APK or a URL. No OpenAI key was read, created, copied or changed; no project protection setting was weakened. This is Dev QA transport, not a Production migration design.
- Debug APK version 0.3.1 / code 8, same `com.addi.app.dev` and debug signer. Native UI, API base URL, OAuth and Push code are unchanged.

## Verification

PASS:

- Actual APK UI: synthetic Dev session → mood questions → offline analysis failure → explicit online retry → real `gpt-5-mini` result → save → dated detail → process stop/relaunch → same saved result.
- Dev database: authenticated owner, completed status, model, and full analysis result match the HTTP result exactly. Detail text matches the saved analysis. Temporary account and owned rows were removed.
- New relay/route tests: Production and wrong-project rejection, Bearer/Origin/input rejection before relay, fixed destination, no URL/cookie secrets, redirect rejection, bounded validated results, safe failures.
- Existing Dev integration: 8 groups for medication schedules, take/undo/time edit, visit CRUD, mood CRUD, owner isolation, profile/session, live MFDS search and disposable-account deletion.
- Native Auth/boundaries: 28 tests; Native Push: 10 tests; shared AI provider: 4 cases; notification fixtures.
- Web typecheck/build, Native typecheck/build, Android assembleDebug/lintDebug, APK signature and package checks.

The first detail assertion used the analysis-result screen selector instead of the existing saved-detail selector. Only the QA selector was corrected; the subsequent full UI run passed without an app change.

Google/Kakao OAuth and Galaxy Push receipt/tap are not claimed by this emulator run. Galaxy acceptance remains pending. Production/Play/Production DB/Production Secret changes and FCM sends: **0**. PR #92 remains unmerged.

## Galaxy APK and install

Durable local artifact:

`/Users/kalummy/Documents/ChatGPT/ADHD 앱 프로젝트/artifacts/capacitor-phase4/ADDI-Dev-0.3.1-native-ai.apk`

SHA-256: `a79168e6c9186364c3df3b64f420e9262cff7a0197ca3b72b474ec8396e48a40`.

1. Transfer the APK to Galaxy and open it in **My Files**. Install it as an update to the existing **아디** Dev app (`com.addi.app.dev`). The Play app (`com.addi.app`) is separate.
2. Keep existing Dev data: update without uninstalling or clearing app data. Verify version `0.3.1-prototype-dev`.
3. Use the existing Dev Google/Kakao identities and designated synthetic QA records. Preserve existing records; do not delete the real account.

| Test | Expected result |
| --- | --- |
| Medicine search → register → take → undo | Official search results, saved medicine, intake toggles persist |
| Mood questions → actual AI → save → reopen | Result appears, same content after dated detail and restart |
| Visit register → edit → delete | Each intended upcoming date change persists |
| Google / Kakao login | Each returns to the Dev app with its existing Dev account data |
| Session restore | Force-close and reopen; same account and saved data |
| Native Push | Medication/mood/visit settings retained; Dev-only test receipt and tap routing |
| Logout / re-login | Signed-out state persists after restart; same account data on re-login |

Push sending retains Phase 3's single-device safety gate. After installing/signing in on Galaxy, the correct Dev installation must be selected with a fresh QA window before pressing **알림 설정 → Dev 알림 테스트**. This AI change does not arm a recipient or send a notification.

**Native implementation and Dev emulator parity: complete. Galaxy acceptance and Production migration preparation: pending.**
