# ADDI Android TWA

이 디렉터리는 Bubblewrap으로 생성한 ADDI의 Trusted Web Activity 프로젝트다.

- 패키지 ID: `com.addi.app`
- 앱 이름: `아디`
- Production origin: `https://addi-gamma.vercel.app`
- 시작 URL: `https://addi-gamma.vercel.app/`
- 버전: `1.0.0` (`versionCode` 1)
- SDK: `compileSdk 36`, `targetSdk 36`
- 알림 위임: `enableNotifications: true`

## TWA 알림 위임

Bubblewrap의 알림 위임을 사용하며 Web Push 구조(Service Worker, VAPID, PushSubscription)는 그대로 유지한다. `twa-manifest.json`을 source of truth로 삼고, 다음 생성물이 release manifest에 모두 포함되어야 한다.

- `android.permission.POST_NOTIFICATIONS`
- `com.addi.app.DelegationService`
- `android.support.customtabs.trusted.SMALL_ICON`
- `com.google.androidbrowserhelper.trusted.NotificationPermissionRequestActivity`

`monochromeIconUrl`은 기존 `addi-footer.svg`의 ADDI `AD` 모노그램 path를 정사각형·단색·투명 SVG로 파생해 재사용한다. Bubblewrap이 이를 Android density별 `ic_notification_icon.png`로 생성하며, Android는 해당 alpha mask를 시스템 색상으로 렌더링한다.

## 서명 준비

서명키와 비밀번호는 저장소에 커밋하지 않는다. 안전한 로컬 경로에서 upload key를 직접 생성한다.

```bash
keytool -genkeypair -v \
  -keystore /secure/path/addi-upload-key.jks \
  -alias addi-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Google Play App Signing을 사용하면 역할이 분리된다.

- Upload key: 개발자가 AAB 업로드 때 서명하는 키다. 로컬에서 보관한다.
- App signing key: Google Play가 사용자에게 배포하는 APK를 서명하는 키다. Play Console이 관리한다.

Digital Asset Links에는 upload key 지문이 아니라 Play Console의 **App signing key certificate SHA-256 fingerprint**를 넣어야 한다. 현재 Play Console 경로는 `Google Play로 보호됨 > Play 스토어 배포 > Play 앱 서명으로 이동`이다. `앱 서명 키` 영역에 관련 SHA-256이 여러 개 표시되면 해당 지문을 모두 등록한다.

지문이 확정되기 전까지 `android/twa-manifest.json`과 `public/.well-known/assetlinks.json`의 배열은 비어 있다. 이 상태는 release-ready가 아니며 DAL 검증과 신뢰된 TWA 알림 위임을 차단한다. 지문을 확보한 뒤 Android 디렉터리에서 각각 추가하면 Bubblewrap이 manifest와 공개 파일을 함께 갱신한다.

```bash
npx --yes @bubblewrap/cli@1.25.0 fingerprint add \
  "<PLAY_APP_SIGNING_SHA256>" \
  --name="play-app-signing" \
  --output="../public/.well-known/assetlinks.json"
```

필요한 지문을 모두 추가하고 아래 versionCode까지 확정한 뒤 `update --skipVersionUpgrade`를 한 번 실행해 Android 생성물도 동기화한다.

## Play 버전 확인

현재 값은 `versionName 1.0.0`, `versionCode 1`이다. signed AAB를 만들기 전에 Play Console의 `테스트 및 출시 > 최신 버전 및 번들 > 모든 앱 버전`에서 전체 업로드 이력을 확인한다. `versionCode 1`이 사용된 적이 있으면 `twa-manifest.json`의 `appVersionCode`를 기존 최고값보다 큰 미사용 값으로 바꾼 뒤 생성물을 갱신한다. 이력 확인 없이 임의로 버전을 올리거나 기존 코드를 재사용하지 않는다.

```bash
npx --yes @bubblewrap/cli@1.25.0 update --skipVersionUpgrade
```

## 빌드 확인

JDK 17과 Android SDK 36을 시스템 전역 대신 Bubblewrap user-local 설정으로 사용할 수 있다. 먼저 환경을 확인한다.

```bash
npx --yes @bubblewrap/cli@1.25.0 doctor
```

Android 프로젝트의 비서명 빌드 검증은 다음과 같다.

```bash
npx --yes @bubblewrap/cli@1.25.0 build --skipSigning --skipPwaValidation
```

Play 업로드용 빌드 전에는 Production PWA 검증을 별도로 통과시킨다.

```bash
npx --yes @bubblewrap/cli@1.25.0 validate \
  --url="https://addi-gamma.vercel.app"
```

signed AAB 생성 시에는 repo 밖의 upload key 절대경로를 지정하고 비밀번호는 대화형 입력으로만 제공한다. 키 파일, 비밀번호, 명령 로그를 Git에 추가하지 않는다.

```bash
npx --yes @bubblewrap/cli@1.25.0 build \
  --signingKeyPath="/secure/absolute/path/addi-upload-key.jks" \
  --signingKeyAlias="addi-upload"
```

## Google Play Internal Testing

Internal App Sharing이 아니라 Internal Testing 트랙을 사용한다.

1. `테스트 및 출시 > 테스트 > 내부 테스트`에서 `새 버전 만들기`를 선택한다.
2. upload key로 서명한 AAB를 업로드하고 검토 후 내부 테스트 출시를 시작한다.
3. `테스터` 탭에서 Galaxy Play Store에 로그인한 Google 계정을 이메일 목록에 등록한다.
4. 같은 계정으로 opt-in 링크를 열고 Play Store에서 ADDI를 설치한다.
5. 설치본에서 로그인과 알림 허용을 수행한 뒤 새 PushSubscription이 Production에 저장되는지 확인한다.
6. 그 설치본 endpoint 1개에만 Test Push를 보내 OS 표시, 클릭 후 `/`, `read_at`, red dot을 확인한다.
