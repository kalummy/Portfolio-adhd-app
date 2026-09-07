# Single-subscription Push E2E

Purpose: one approved Chrome subscription, one provider attempt, then device verification of ADDI notification delegation. This does not use reminders, scheduler, `/api/push/test`, or in-app notification history.

## Request and authorization

`POST /api/push/e2e` accepts exactly `{ "runId": "<approved UUID>" }`. All other body fields are rejected. Requires a same-origin `Origin` header and a current Supabase user verified with `auth.getUser()`. The route authenticates itself; the proxy does not redirect an unauthenticated API request to HTML.

`PUSH_E2E_ENABLED` must be exactly `true`. Missing, `false`, uppercase or whitespace variants are disabled. Disabled requests return `404 {ok:false,code:"disabled"}` before auth, DB or VAPID initialization. Keep it false in Preview and Production until a separately approved live send. This switch is entirely independent of `REMINDER_SCHEDULER_ENABLED`.

## Target and one-shot boundary

`push_e2e_runs` stores only IDs, a full SHA-256 endpoint fingerprint, state/timestamps and sanitized result metadata. No raw endpoint, encryption keys, message or provider error is persisted there. RLS is enabled and forced. `anon`/`authenticated` have neither table privileges nor execute privileges on the preparation/consume functions. Only the service role has application access; PostgreSQL administrative roles retain their inherent administrative privileges.

`consume_push_e2e_run(runId, authenticatedUserId)` runs as SECURITY INVOKER with service-role credentials. It locks the exact run, checks its owner, ready state and expiry, locks the exact active subscription, checks its owner and full endpoint hash, and transitions ready to consumed in the same committed transaction. Only the winning RPC returns one subscription. There is no user-wide selection, list/fan-out or fallback. The handler independently rechecks IDs, ownership, active status, full hash and expiry before passing one object to the unchanged `sendWebPush()`.

The guard trigger prevents target changes, expiry extension, returning a consumed/failed/cancelled/expired run to ready, and overwriting a recorded outcome. Run lifetime is at most 10 minutes. A run marked consumed with no result means outcome unknown: it must never be retried. A crash between consumption and sending can result in zero pushes. This is at-most-once, deliberately sacrificing delivery/retry guarantees.

Consumption commits before the provider call. Configuration failure, invalid claims and lost RPC responses produce no send. There is no automatic retry of claim or sender. 2xx is recorded as consumed; 404/410/429/5xx or timeout/network failure are recorded as failed. No subscription is revoked. Result-write failure leaves the run spent and returns `retryable:false`. Switching off stops new attempts; it cannot recall a request already handed to the provider. The switch is checked again immediately before sending.

## Fixed payload and device result

- Title: ADDI 알림 테스트
- Body: 알림이 정상적으로 도착했어요.
- Route: `/`
- Notification ID/tag: `push-e2e:<runId>`

No `app_notifications` or `reminder_dispatches` row is inserted/updated by the route. Existing service-worker click handling may make its usual read PATCH for this notification ID; since no matching history row is created, it changes zero rows. The existing service worker icon/badge are reused. Server acceptance does not prove delivery, app attribution or TWA return.

Success requires all three: provider 2xx; Galaxy shows ADDI app name/icon; tapping returns to ADDI TWA without an address bar. Samsung Internet attribution, opening ordinary Chrome, or no visible notification does not pass E2E. Capture provider status and device observations separately. Never log raw endpoint, keys, VAPID credentials or provider response body.

## Production rollout: separate approvals required

1. Review the branch, approve PR/merge and Production deployment **with the switch false**, and approve applying only `20260907032223_create_push_e2e_runs.sql` to Production `joffvlsyxivveqycjrio`. Verify exact migration/grants/schema and deployed commit. No other pending Dev migration should be applied opportunistically. No Production changes have been authorized for the current implementation phase.
2. Approve preparation of **one** Production run. Reconfirm the expected account independently. In a privileged operation call `prepare_push_e2e_run(<approved user UUID>, 'dd60ebf0074ab465')`. The function counts fingerprint matches across all subscriptions before checking owner/active; zero or multiple matches raises an error and inserts no run. It stores the matching subscription ID and full 64-character hash, never a prefix or endpoint. Verify the returned run metadata against the approved account and Chrome target. Never substitute the account's other active subscription. No public run-creation API is provided. Do not create extra runs to recover from an ambiguous result.
3. Approve temporary Production `PUSH_E2E_ENABLED=true` and **one** real POST from the logged-in Galaxy account with that approved runId. Account for deployment time: prepare the 10-minute run when the device and enabled deployment are ready; never extend an expired run. A replacement run after expiry/failure/ambiguity requires a new explicit approval and evidence that a new attempt is warranted. The consumed run itself cannot be reset.
4. Record sanitized provider status and device results, set the Production E2E switch false again under the approved cleanup plan, and cancel any unconsumed run or let its 10-minute validity end. Removing the route/feature can be a later approved change; retain the spent audit row. Scheduler remains unchanged throughout.

## Verification performed in this implementation phase

- `npm run push-e2e:fixtures`: invalid/body/owner/subscription/hash/revocation/state/expiry/switch guards; 32 concurrent requests with 1 winning response and 1 mock send; sequential retries; provider 2xx, 404, 410, 429, 500, 503, timeout and network ambiguity; lost claim response and lost result write. No actual sender is imported by this fixture.
- `scripts/push-e2e-db-fixtures.sql`: executed only on ADDI Dev `ohobxicxchkaisxxswkk`; transaction-scoped synthetic users/subscriptions and runs, rollback at end. Actual SQL functions, state transitions, RLS/grants and isolation checks pass. The extremely unlikely duplicate SHA prefix is simulated by replacing only the hash dependency in a temporary copy of the preparation function; Production/public digest functions are untouched.
- Eight parallel Dev consume RPCs against one synthetic run: 1 winner, 7 rejected. No provider invoked. Committed concurrency fixtures were removed afterward; runs and synthetic subscriptions remaining: 0.
- Local production build: typecheck/build PASS. Existing notification, reminder and account-deletion fixtures PASS. The account-route fixture was adjusted to permit the new self-authenticating route while retaining its existing account-route assertion.
- Git Preview deployment READY. The authenticated official Vercel CLI verified `POST /api/push/e2e` with an empty body returns `{ok:false,code:"disabled"}`. Local built-server HTTP verification returned 404 with the same body. Deployment protection stayed enabled; no approved runId or actual Push was used.
- Dev migration version is `20260907032223`, assigned by the remote migration service. The file was initially created with the CLI and renamed to this actual applied version; migration history was not edited.
- Security advisor: no new WARN/ERROR. The new INFO “RLS enabled, no policy” is intentional for the service-only table with client grants revoked. Existing leaked-password protection warning is unchanged. See [RLS no-policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [password protection advisory](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

The implementation does not establish the Production scheduler's ON/OFF state. Report it as unchanged/unconfirmed unless separate current runtime evidence resolves it. Never infer OFF from zero dispatches.
