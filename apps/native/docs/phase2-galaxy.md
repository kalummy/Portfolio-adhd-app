# Galaxy: isolated ADDI Dev Auth QA

## Install identity

- Debug application ID: `com.addi.app.dev`; label: **ADDI Dev**.
- Gradle keeps the base namespace/application ID for future work but applies `.dev` to every enabled debug variant. Release variants remain disabled.
- Main activity: `com.addi.app.MainActivity`. Android app UID, private data and Keystore access are separate from the installed `com.addi.app` Play app.
- Supabase: existing **ADDI Dev** only. PKCE, system browser, exact callback validation and Android Keystore storage are unchanged.
- Callback: `https://addi-galaxy-auth-dev.vercel.app/auth/native/callback`.
- The separate static Dev Vercel project serves only callback HTML and DAL. Its DAL now targets only `com.addi.app.dev`, with the certificate extracted from this APK. Production DAL is unchanged.
- The Dev redirect allowlist preserves its seven existing entries and adds the Galaxy callback plus `?attempt=*`. All other Auth settings and provider consoles remain unchanged.

## Build verification

The delivered APK passed typecheck/build, 28 tests, Gradle assembleDebug/lintDebug, certificate inspection, coexistence with the previous emulator package, verified implicit cold/foreground App Links, Google/Kakao login UI rendering and a Keystore round-trip. These are emulator results, not completed Galaxy OAuth acceptance. See `phase2-evidence/galaxy-dev-build.json`.

## Installation and manual test

1. Transfer the provided APK to Galaxy and open it in **My Files**. The installer must show **ADDI Dev**. Keep the existing **ADDI** app installed. Allow this installation source if Android prompts, then restore that permission afterward.
2. Stay online for Android's automatic link verification. In Settings → Apps → ADDI Dev → Set as default / Open supported links, confirm the Dev host is supported. Manually selecting a host is not evidence of OS verification.
3. Open **ADDI Dev**, choose Google, and use the same Google account previously used in **ADDI Dev Supabase**. Complete login directly in the system browser within five minutes. The result should return to **ADDI Dev**, then Home. If an attempt expires, cancel and start again in the app.
4. Check the existing medication, mood and visit screens. Do not create/edit/delete records for this read-only acceptance pass. An empty Dev account is not proof of lost Production data; Dev and Production are separate.
5. Remove **ADDI Dev** from Recents, reopen it, and confirm that login and the same records remain. Do not clear app data or uninstall for this test.
6. Log out from My, restart ADDI Dev and confirm it stays signed out.
7. Choose Kakao and use the existing Dev Kakao identity. If KakaoTalk opens, continue there. Confirm return to **ADDI Dev**, existing records, restart persistence, and logout again.
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
