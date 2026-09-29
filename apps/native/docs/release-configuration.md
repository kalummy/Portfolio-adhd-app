# Native Android environment selection

The build stage is explicit. Set both `ADDI_NATIVE_STAGE` and `VITE_NATIVE_STAGE`
to `development` or `production`. The two values must match.
`native-environments.json` is the public source for package, Supabase project,
Firebase project, callback, and signing fingerprints. Build validation rejects
cross-environment URLs, callbacks, packages, Firebase clients, and App Links.

| Stage | Android and Capacitor ID | Supabase | Firebase Android client |
| --- | --- | --- | --- |
| development | `com.addi.app.dev` | ADDI Dev | `com.addi.app.dev` |
| production | `com.addi.app` | ADDI Production | `com.addi.app` |

The production Firebase file belongs at
`android/app/src/release/google-services.json`; the existing Dev file stays at
`android/app/google-services.json`. Both are ignored by Git. The two Android
clients can share Firebase project `addi-503b5`; Gradle checks the selected
package and distinct Firebase app IDs.

For a configuration validation without an APK or AAB, set the selected
`VITE_NATIVE_*` values, run `npm run build`, then
`ADDI_NATIVE_STAGE=production npx cap copy android`. With JDK 21 and Android
SDK set, run `./gradlew :app:processReleaseGoogleServices
:app:compileReleaseJavaWithJavac :app:lintRelease` from `android/`.
This only compiles and checks the release variant.

Production validation also needs `ADDI_NATIVE_RELEASE_VERSION_NAME` (proposal:
`1.0.3-rc1`, not finalized), `ADDI_NATIVE_UPLOAD_KEYSTORE_PATH`, and
`ADDI_NATIVE_UPLOAD_KEY_ALIAS`. VersionCode is the RC candidate 14. The
existing upload JKS public certificate is checked against the Play Upload
certificate before any release task. A future signed artifact additionally
requires `ADDI_NATIVE_UPLOAD_STORE_PASSWORD` and
`ADDI_NATIVE_UPLOAD_KEY_PASSWORD` through the local process environment.
Never place credentials or Firebase JSON in Git.

The production callback is
`https://addi-gamma.vercel.app/auth/native/callback`. The Web callback remains
`/auth/callback`. Production App Links use the Play App Signing certificate in
`public/.well-known/assetlinks.json`; an upload-key sideload is not an App Link
verification. This configuration work does not run OAuth, FCM, scheduler, or
Play release steps.

The current main Native shell still rejects same-origin `/api/*` calls and its
`nativeApi` adapter is unavailable. This PR selects and permits the matching
Native Edge origin but does not change that feature boundary.
