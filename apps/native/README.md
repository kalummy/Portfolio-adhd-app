# Phase 2 Native Auth

The current branch adds isolated Native Auth. Read [Phase 2 architecture, setup and QA](docs/phase2-auth.md) first. Live Google/Kakao acceptance is pending; no Production or Play changes are authorized. The Phase 1 notes below describe the original fixture shell baseline.

# ADDI Phase 1 — Capacitor shell prototype

로컬 React 번들을 Android 내부 WebView에서 실행하는 **fixture 전용 prototype**입니다. 현재 웹/TWA와 별도 패키지이며, Production 연결과 Play 배포 용도가 아닙니다.

## Architecture

```text
Existing React screens + globals.css + design tokens + domain functions
                            │ direct imports
              Vite entry / native router / platform adapters
                            │ local dist assets
                  Capacitor BridgeActivity / Android WebView

Existing Next.js API / AI / medication search / account deletion
                  (unchanged; not connected in Phase 1)
```

- `src/main.tsx`, `src/app.tsx`: 앱 전용 entry와 route table. Next layout/server pages를 실행하지 않음.
- `src/platform`: 내부 router, local image/link, lifecycle/back 처리.
- `native-aliases.ts`: **앱 빌드에서만** Next navigation/image/link 및 데이터·인증·Push·analytics 의존성을 교체. 웹의 import 해석은 바뀌지 않음.
- `src/adapters/repositories.ts`: 기존 repository 인터페이스를 구현하는 fixture 저장소. `storageBackend: indexeddb`는 기존 화면의 discriminator를 만족시키는 값이며, 실제 저장은 native origin의 별도 localStorage key.
- `src/adapters/mood-draft.ts`: 기존 초안 검증/정규화 로직을 재사용하며 `native-prototype` namespace에 fixture 초안 저장. 프로세스 종료 후 복원 가능.
- `src/adapters/boundaries.ts`: Phase 2 Auth/API, Phase 3 Push 인터페이스. 현재는 명시적으로 unavailable error를 반환.
- `capacitor.config.ts`: `webDir: dist`, `appId: com.addi.app.dev`. `server.url`/remote navigation 없음.
- `android/`: 기존 repository 루트의 TWA `android/`와 독립된 Capacitor 프로젝트.
- 루트 변경은 `tsconfig.json`의 `apps/native` 제외 한 줄뿐. 웹/앱은 각각 typecheck.

## UI reuse

| Route | 그대로 가져오는 기존 화면 |
|---|---|
| `/` | `HomeScreen`, Home calendar/date sheet, BottomNavigation |
| `/medications` | 기존 client `MedicationListPage` |
| `/moods` | `MoodHistory`, report, cat collection |
| `/visits` | 기존 client `VisitListPage` |
| `/notifications` | `NotificationsScreen` + 기존 알림 fixture |
| `/my` | `MyHomeScreen` + synthetic display context |
| `/moods/new` | `MoodQuestionFlow`의 질문/입력 UI |
| `/moods/:date` | `MoodRecordDetail` |
| `/visits/new`, `/visits/edit` | `VisitCalendarScreen` |
| `/medications/:id/schedule` | `MedicationScheduleEditor` |

`app/globals.css`, `design-tokens/colors.css`, Pretendard, 기존 이미지/아이콘을 직접 사용합니다. JSX, 디자인 토큰, 컬러, typography, spacing, 주요 화면 layout은 수정하지 않았습니다. KST 날짜, 주간 복용 진행률, 약 표시/스케줄/시간, 감정 요약/리포트/고양이 계산도 공유합니다.

앱 전용 CSS 변경은 native viewport 연결뿐입니다. Vite가 공유 CSS의 `env(safe-area-inset-*)` 읽기를 Capacitor CSS 변수 fallback으로 변환합니다. 원본 웹 CSS는 바뀌지 않습니다.

### 의도적으로 연결하지 않은 기능

- 로그인/소셜 연결/로그아웃/탈퇴, 약품 검색, 알림 설정 등은 placeholder 또는 unavailable adapter입니다.
- 감정 질문과 텍스트 입력은 검증 가능하지만, 마지막 AI 분석/완료는 미연결 오류 상태로 끝납니다. 실제 AI 결과 생성 및 서버 저장은 Phase 1 범위가 아닙니다.
- 알림 목록의 `subscribed` 값과 로그인된 display context는 **synthetic UI fixture**입니다. 실제 permission, session, subscription, token을 뜻하지 않습니다.
- 이름/프로필/알림 read state 일부는 메모리 fixture이며, 앱 종료 후 초기화될 수 있습니다. 복용/내원 fixture와 감정 초안은 별도 localStorage에 유지됩니다.
- 실제 건강정보를 넣는 저장소로 사용하지 않습니다. Phase 2에서 계정별 저장·암호화·로그아웃/탈퇴 정리 정책을 구현해야 합니다.

## Native shell

- Android 12+ Native Splash + 기존 ADDI 아이콘. 원형 마스크 안에 artwork가 들어가도록 Splash에 inset만 적용. web launch Splash는 꺼짐.
- SystemBars가 밝은 배경의 어두운 시스템 아이콘과 OS inset을 관리. `initialViewportFitValueHint: cover`로 첫 프레임의 inset 의도를 제공.
- 설치된 Capacitor 8.5.2의 지침대로 `Keyboard.resizeOnFullScreen`은 설정하지 않음. SystemBars가 IME 공간을 관리하고 Keyboard 플러그인은 표시/숨김 이벤트를 제공.
- Back 순서: 키보드 → 기존 dialog/sheet 닫기 → 화면의 기존 back 처리 → 앱 route history → Home → Activity 종료.
- resume는 shell state와 화면 refresh 이벤트만 발생. 서버 세션/permission/network를 갱신하지 않음.
- `MainActivity`는 `https://localhost` 로컬 asset 경로만 허용하고 외부 navigation/request를 차단. 브라우저 실행 API 없음.
- HTML CSP, frontend fetch adapter, 번들 module audit로 서버/분석/Push 코드 유입을 방지.
- `__ADDI_SHELL_QA__`는 prototype의 lifecycle 상태와 back hook만 제공. record content나 credentials를 포함하지 않음. 출시 전에 제거할 QA bridge.

## Build / run

요구사항: Node 22+, JDK 21, Android SDK 36. Capacitor 8.5.2 / Gradle 8.14.3 / AGP 8.13.0. npm lockfile에 실제 설치 버전이 고정되어 있습니다.

```sh
# repository root: shared screen dependencies
npm ci
npm run typecheck
npm run build

cd apps/native
npm ci
npm run build
npm run dev

# Android: JAVA_HOME and Android SDK path must be configured locally
npm run android:debug
```

`android/local.properties`에 `sdk.dir=/your/android/sdk`를 설정하거나 환경에 SDK 경로를 지정합니다. 이 파일은 commit하지 않습니다.

APK: `android/app/build/outputs/apk/debug/app-debug.apk`.

`applicationId` 기본값은 `com.addi.app`이며 debug 빌드는 `.dev` 접미사를 적용해 `com.addi.app.dev` / `ADDI Dev`로 설치됩니다. 기존 Play/TWA와 동시에 설치할 수 있고 저장소도 분리됩니다. Galaxy 수동 QA는 [설치 안내](docs/phase2-galaxy.md)를 따릅니다. Production upload signing은 연결하지 않았고 **app release variant를 비활성화**했습니다. 앱 release AAB를 생성하거나 Play에 올리는 흐름은 제공하지 않습니다.

## QA

```sh
npm run build
npx vite preview --host 127.0.0.1 --port 4173
# separate terminal; Chrome executable can be overridden with CHROME_PATH
npm run qa:web
npm test

# disposable AVD name must start with addi_phase1_
# install debug APK and launch com.addi.app.dev/com.addi.app.MainActivity first
ANDROID_SERIAL=emulator-5554 npm run qa:android
ANDROID_SERIAL=emulator-5554 node scripts/qa-splash.mjs
```

QA는 `qa-artifacts/`에 PNG/JSON/영상으로 저장됩니다. 재현 script와 이번 실행 요약은 [QA report](docs/phase1-qa.md)를 참조하세요. 테스트는 화면/키보드/back/lifecycle을 검증하며 실제 OAuth·서버 데이터·Push를 검증하지 않습니다.

## Phase 2 / 3 boundary

Phase 2: system browser OAuth + verified callback, PKCE/state 검증, 동일 Supabase user identity, 안전한 Native session 저장/refresh, bearer 기반 API 인증, CORS, 계정 전환/로그아웃/탈퇴 시 데이터 정리. 현재 fixture session을 실제 auth로 취급하면 안 됩니다.

Phase 3: FCM permission/token lifecycle, 계정별 token ownership/revocation, Native preferences, notification tap navigation, Web Push와의 중복 방지 및 scheduler transport 분리. 현재 Web Push/SW/subscription/scheduler는 그대로 유지됩니다.

API 24 minimum은 기존 TWA의 API 23보다 높으므로 향후 Play 전환 시 지원 기기 검토가 필요합니다. 실제 Galaxy, 구형 Android, notch/회전/분할화면, Play 업데이트·signing migration 검증은 아직 하지 않았습니다.

참고: [Capacitor 8 요구사항](https://capacitorjs.com/docs/updating/8-0), [SystemBars](https://capacitorjs.com/docs/apis/system-bars), [App lifecycle/back](https://capacitorjs.com/docs/apis/app).
