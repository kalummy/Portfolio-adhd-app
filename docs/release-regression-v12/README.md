# Alpha v12 release regression — 2026-09-15

## Release verdict

**NOT release-ready.** The web layout fixes are ready for review. Android runtime, the currently served Play release, Production scheduler state and current provider ownership remain unverified. No merge or release was performed.

Base: `origin/main` `20cc4b148daf8a20dca914925899d3e62a9acb33`, isolated worktree. Main's Android source is **versionCode 4 / 1.0.0**, whereas the archived, previously validated Alpha AAB is **12 / 1.0.2**. Building tracked `android/` would not reproduce v12. This PR does not replace launcher assets or change version fields to conceal that drift.

## Root cause and minimal changes

### 1. TWA / Push

- The archived v12 launcher explicitly uses `com.android.chrome`, verifies `RELATION_HANDLE_ALL_URLS` for exactly `https://addi-gamma.vercel.app`, then calls ABH `launchTwa()`. Missing provider/session, failed validation or a 20-second timeout leads to an ADDI error dialog. The app fallback override does not launch a Custom Tab or WebView.
- ABH 2.7.2 `DelegationService`, notification permission activity and token store are present. Web rendering alone is not a failure criterion; a visible browser toolbar, external browser task or browser-owned notification is.
- Live Production assetlinks includes `com.addi.app`, `delegate_permission/common.handle_all_urls` and certificate `47:D7:85:98:D0:5A:77:6F:21:67:50:0F:16:26:38:06:27:9F:06:58:E6:E3:78:92:E0:61:E0:E9:96:A1:29:14`. Google DAL check for that certificate returned **linked:true**. The current Play Console signing screen was inaccessible, so the certificate's current Console identity is not reverified.
- Read-only Production aggregate: two active FCM subscriptions belonging to one valid owner, all medication/visit/mood preferences true; one additional active Apple subscription. The schema stores no browser identity. FCM does **not** prove Chrome; a Samsung-owned FCM endpoint cannot be excluded. Device subscription matching is pending.
- Last 30 days: ten `sent` reminder dispatches, latest update `2026-09-05T12:00:29.181Z`. No more recent dispatch was found. This proves recorded provider acceptance, not app attribution or device receipt.
- Current `REMINDER_SCHEDULER_ENABLED`, Android User-Agent/Referer and provider request logs remain unknown: Vercel connector returned 403/404 and existing CLI authentication returned 403. No scheduler endpoint was invoked. Historical OFF notes are not current evidence.
- No speculative Push code change. There is no demonstrated current provider or scheduler defect that can safely be corrected from these observations.

### 2. Splash

Archived v12 has no `windowSplashScreen*` configuration; the launcher inherits a translucent system theme. Android 12+ can therefore use the launcher icon for its system Splash. Then v12 explicitly renders a progress spinner and opening text while verifying DAL. ABH subsequently renders a separate square AD image on `#FAFAFB` with a 300 ms fade. The website uses the existing ADDI wordmark and mint gradient, including a session-scoped member animation. These are distinct visual stages in source; actual flicker duration is unmeasured.

`android-splash-v12.patch` is a **reviewable candidate against the archived v12 source**, not a patch applied to main's obsolete Android wrapper:

- Activity-only Android 12+ theme uses the same existing `backgroundColor` and an ADDI wordmark drawable.
- The wordmark preserves every path and gradient in `public/auth/addi-logo.svg`, centered at 154 × 62 dp inside the 288 dp system icon area.
- The same drawable and CENTER scaling drive the DAL wait view and ABH Splash. Pre-12 retains the existing native splash asset through a resource alias.
- Chrome validation, token store, retry/failure behavior, ABH delegation, launcher icons, version fields and web Splash remain unchanged.
- `git apply --check` against archived v12 and `aapt2 compile` of the candidate resources passed. Every existing PNG and both version-bearing files are byte-identical. This is not Gradle/AAB validation or runtime proof.

**New AAB required: YES** to deliver the native theme/activity/resource changes. No AAB/APK was built; no versionCode was changed. Before an Android release, reconcile the verified v12 source baseline, apply the patch there, compile/lint, and obtain explicit approval for a fresh versionCode/build. Never apply it blindly to main's v4 wrapper.

References: [Android system Splash](https://developer.android.com/develop/ui/views/launch/splash-screen), [ABH](https://github.com/GoogleChrome/android-browser-helper). The locally inspected ABH 2.7.2 bytecode calls `TrustedWebUtils.areSplashScreensSupported` for `TrustedWebActivitySplashScreensV1`; actual installed provider/version capability needs a device.

### 3. Bottom Navigation line

Actual `.bottom-navigation` CSS set a 1 px top border and an upward shadow. Removed only these two declarations. Background, icons, 56 px tabs, width, fixed positioning and `env(safe-area-inset-bottom)` remain unchanged. No pseudo-element line is present in the measured DOM.

### 4. Notification 90-day footer

The JSX was already after the list, but CSS fixed the notice at `bottom:80px`, so long lists scrolled behind it. Removed fixed coordinates/transform and nowrap; the semantic footer now stays in normal flow with the existing content gap of 32 px. Text may wrap and decorative dividers shrink without overlapping. Card dimensions, spacing and type tokens are unchanged. Empty and Push-off states still omit the footer.

## QA

| Check | Result |
| --- | --- |
| Production Google DAL | PASS linked:true for the listed certificate |
| v12 source Chrome TWA/delegation gate | PASS static inspection only |
| Current Play served version/name | BLOCKED — Console not readable; archive only proves v12 upload/submission |
| Android standalone, task, cold/warm start, attribution | BLOCKED — `adb devices -l` returned no device |
| Current scheduler/runtime/Referer | BLOCKED — Vercel access denied |
| Local Preview 320×800, 360×800, 390×844, 430×800 | PASS layout geometry at 100% and 200% notification text size |
| Footer | 24 synthetic items, newest-first; last-item gap 32 px, no row/date/footer overlap or horizontal overflow |
| Empty state | Footer count 0 at every width |
| Bottom Navigation | border 0 px, shadow none; background/icons preserved |
| Real nonzero safe-area inset | NOT VERIFIED; source expressions preserved, desktop inset is 0 |
| Home / notification settings | Synthetic Preview smoke; no real-account writes |
| Medication / Mood / visits | Relevant local repository/flow fixtures; authenticated browser E2E remains unverified |
| Typecheck / build | PASS; local Preview uses synthetic non-network Supabase settings |
| Existing relevant tests | PASS notification, reminder, both Push E2E suites, app version, my-home, Mood flow/ownership, medication management, Home date/load, visit bootstrap/merge |
| 90-day policy | Actual repository with mock backend: inclusive boundary retained; boundary minus 1 ms excluded; descending order; unsupported kind excluded; empty result |
| Android candidate | Patch applicability, resource compilation and invariant comparison PASS; no native build/runtime |

The existing notification fixture expected a prop-less settings component even though main already supplies a gated E2E action. Updated that stale assertion to verify the current server-gated offer; no settings behavior changed.

## Reproduce web QA

Use installed dependencies from the lockfile. Build/start with `VERCEL_ENV=preview`. For isolated local layout QA, set `NEXT_PUBLIC_SUPABASE_URL=https://release-qa.invalid` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-qa-only` at both build/start; do not copy Production secrets.

- `npm run typecheck`
- `npm run build`
- `npm run notifications:fixtures`
- `npm run reminders:fixtures`
- `node scripts/notification-list-fixtures.cjs`
- `QA_BASE_URL=http://localhost:3215 QA_OUTPUT_DIR=/tmp/addi-qa node scripts/release-regression-ui.cjs`

The browser script needs Playwright available via `PLAYWRIGHT_MODULE` or normal module resolution, and installed Chrome. It launches its own empty browser context and blocks mutation methods, Production origin, Supabase and analytics requests. The regression route is denied outside Preview/development. A local fixture PASS is not authenticated Production/device E2E.

## Production safety

Push / Test Push **0**. Scheduler changes **0**. Production DB/subscription mutations **0**. Schema changes **0**. No revoke/delete, Play upload/promotion, merge or manual Production deployment. Production SQL used explicit read-only transactions and aggregate outputs; no raw endpoint, key, identity or health record content was exported.

Codex in-app browser opening was requested for Preview and Play Console, but returned `queued`; its control process repeatedly exited even after reset. An explicitly approved attempt to find an existing controllable Chrome also found no running debugging instance. Play state remains unknown rather than inferred from the uploaded artifact.
