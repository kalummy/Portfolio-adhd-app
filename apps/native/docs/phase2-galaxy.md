# Galaxy: isolated ADDI Dev Auth QA

## Install identity

- Debug application ID: `com.addi.app.dev`; label: **아디**.
- Gradle keeps the base namespace/application ID for future work but applies `.dev` to every enabled debug variant. Release variants remain disabled.
- Main activity: `com.addi.app.MainActivity`. Android app UID, private data and Keystore access are separate from the installed `com.addi.app` Play app.
- Supabase: existing **아디** only. PKCE, system browser, exact callback validation and Android Keystore storage are unchanged.
- Callback: `https://addi-galaxy-auth-dev.vercel.app/auth/native/callback`.
- The separate static Dev Vercel project serves only callback HTML and DAL. Its DAL now targets only `com.addi.app.dev`, with the certificate extracted from this APK. Production DAL is unchanged.
- The Dev redirect allowlist preserves its seven existing entries and adds the Galaxy callback plus `?attempt=*`. All other Auth settings and provider consoles remain unchanged.

## Build verification

The delivered APK passed typecheck/build, 28 tests, Gradle assembleDebug/lintDebug, certificate inspection, coexistence with the previous emulator package, verified implicit cold/foreground App Links, Google/Kakao login UI rendering and a Keystore round-trip. These are emulator results, not completed Galaxy OAuth acceptance. See `phase2-evidence/galaxy-dev-build.json`.

## Installation and manual test

1. Transfer the provided APK to Galaxy and open it in **My Files**. The installer must show **아디**. Keep the existing **ADDI** app installed. Allow this installation source if Android prompts, then restore that permission afterward.
2. Stay online for Android's automatic link verification. In Settings → Apps → 아디 → Set as default / Open supported links, confirm the Dev host is supported. Manually selecting a host is not evidence of OS verification.
3. Open **아디**, choose Google, and use the same Google account previously used in **ADDI Dev Supabase**. Complete login directly in the system browser within five minutes. The result should return to **아디**, then Home. If an attempt expires, cancel and start again in the app.
4. Check the existing medication, mood and visit screens. Do not create/edit/delete records for this read-only acceptance pass. An empty Dev account is not proof of lost Production data; Dev and Production are separate.
5. Remove **아디** from Recents, reopen it, and confirm that login and the same records remain. Do not clear app data or uninstall for this test.
6. Log out from My, restart ADDI Dev and confirm it stays signed out.
7. Choose Kakao and use the existing Dev Kakao identity. If KakaoTalk opens, continue there. Confirm return to **아디**, existing records, restart persistence, and logout again.
8. Record provider, app-return YES/NO, visible existing-data YES/NO, and restart-persistence YES/NO. Do not share credentials, callback URLs, tokens, emails, raw user IDs or screenshots containing health records.

## Device-backed identity acceptance

Visual data checks alone cannot prove exact `auth.users.id` equality. A read-only USB QA check must compare the server-validated session ID against the pre-login Dev identity baseline and query own-user records with that session. Report equality/read results only. A local helper is prepared with the delivery APK; it reads only `com.addi.app.dev` and sends authenticated reads only to ADDI Dev. No password or token is requested from the user.

With the Galaxy explicitly selected, the OS routing checks are:

```sh
adb -s "$GALAXY_SERIAL" shell pm verify-app-links --re-verify com.addi.app.dev
adb -s "$GALAXY_SERIAL" shell pm get-app-links com.addi.app.dev
adb -s "$GALAXY_SERIAL" shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'https://addi-galaxy-auth-dev.vercel.app/auth/native/callback?qa_probe=galaxy'
```

Require `verified` and resolution to `com.addi.app.dev/com.addi.app.MainActivity`; do not force a component or manually override verification. Run probes before OAuth, not during an active attempt. A harmless probe verifies routing only, not OAuth or code exchange.

Real Galaxy OAuth, exact identity equality, real-session refresh, cancellation, duplicate/expired callbacks and cold callback acceptance remain unverified until performed. Do not merge PR #90 based on APK preparation alone. No Production, Play, TWA, Push or scheduler changes are included.

## Superseded: initial header, icon and Korean label update (0.1.1)

- Launcher label is now **아디**; the isolated package remains `com.addi.app.dev`.
- Android 8+ adaptive icons retain the original artwork and let the launcher apply its rounded mask. Legacy bitmap fallback remains for Android 7.
- Native Home uses a sticky header in normal flow, replacing the former fixed-header spacer with the same 64px header. Native overscroll is disabled. Shared web CSS is unchanged.
- Version code 2, signed with the same Dev certificate: install as an update without uninstalling or clearing app data.
- Verified: compiled CSS layout at 360/390/430; actual Android WebView touch swipes with synthetic Home DOM; rounded icon and Korean label in Android app info; build/typecheck, 28 tests and Gradle assembleDebug/lintDebug.
- This is fixture-based UI verification. The reported Galaxy scroll symptom still requires a check on the updated APK; exact live Auth identity acceptance is unchanged.

## Current layout and launch correction (0.1.2)

- Native Vite substitutes only HomeScreen's `MobileShell` import. The adapter keeps the shared header and body content, places the body/footer in a bounded scrollport, and leaves navigation/overlays outside it. No shared React screen or web stylesheet changes.
- Home is a fixed viewport frame with OS inset, 64px header, body scrollport, and bottom navigation. Body clipping is independent of the header; the document does not scroll. The calendar dialog locks the body scrollport and remains outside its clip. System bars are explicitly shown at startup.
- Icon foreground inset is proportional (`18.906%`) instead of absolute dp. It is derived from the existing 1024px artwork's maximum logo radius (503.133px) and Android's 66/108 safe circle. Original bitmap and full-bleed background are unchanged; no bitmap padding or border was added. The actual emulator launcher shows the whole mark inside its circular mask.
- System launch icon is transparent, legacy fallback is plain, and splash fade is zero. The OS starting window remains, then the existing brand/login UI appears without the extra launcher-logo overlay.
- Version code 3 / `0.1.2-prototype-dev`, same package and signing certificate. Update the existing Dev app without uninstalling.

Validation: real shared HomeScreen with previewData at 360/390/430, OS inset/header/body/nav geometry, calendar modal + Escape, final APK WebView touch swipes using rendered Home markup, actual launcher icon, cold-start frame capture, native typecheck/build, 28 tests, assembleDebug/lintDebug. Device-specific Galaxy retest remains required; these checks do not constitute live OAuth identity verification.

References: [Android adaptive icon safe region](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive), [Android system starting window](https://developer.android.com/develop/ui/views/launch/splash-screen).
