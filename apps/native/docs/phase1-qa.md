# Phase 1 QA — 2026-09-15

## Result

**Phase 1 Capacitor shell prototype 성공 YES. Phase 2 Auth 구현 착수 가능.**

Phase 1 UI/Native shell 범위의 결과입니다. 실제 OAuth/API 인증, AI 분석 완료, Native FCM, Play migration이 완성되었다는 뜻이 아닙니다.

- 기준: `origin/main 65cd794710e151f748bdb11041d2de0adb5abfe0`
- branch: `feature/capacitor-shell`
- 환경: 새 AVD `addi_phase1_api36`, Android 16 / API 36 / arm64, debug `com.addi.app`.
- Capacitor 8.5.2, AGP 8.13.0, Gradle 8.14.3, JDK 21.
- 앱: versionCode 1 / versionName `0.1.0-prototype`, minSdk 24, targetSdk 36.
- Debug APK SHA-256: `691250654a24615a9991dfe492300a3c4c43ad89c717ca624346c3f768197d64`
- 실제 Play 앱·사용자 계정·Production 데이터를 사용하지 않음.

## Checks

| 항목 | 결과 / 근거 |
|---|---|
| Android debug build | `assembleDebug` PASS, 최종 incremental 183 tasks |
| 앱 typecheck / bundle | `npm run build` PASS; forbidden runtime module audit PASS |
| 웹 typecheck / build | 루트 `npm run typecheck`, `npm run build` PASS |
| Browser UI | 360/390/430 × 6 화면 + interaction = 21 groups PASS |
| Android WebView UI | 360/390/430 × 6 화면 + Native interaction/lifecycle = 24 groups PASS |
| 화면/폰트/이미지 | 기존 Pretendard·CSS, 가로 overflow 0, broken image 0 |
| Cold start | 최종 lifecycle run: `LaunchState: COLD`, TotalTime 885ms |
| Warm start | Activity 종료 후 동일 PID: `LaunchState: WARM`, TotalTime 324ms |
| Background → resume | Activity foreground 복귀, resume count 증가, 입력 유지 |
| Native Splash | ADDI artwork 유지; 원형 마스크 inset 보정 후 프레임/영상 확인 |
| Status/navigation bars | 밝은 배경의 어두운 시스템 아이콘. 실제 OS bar와 WebView 영역 분리 확인 |
| Safe area | emulator의 CSS inset은 0px: SystemBars가 native frame에 OS 공간 적용. 중복 padding 없음. browser에서는 top/bottom 24px 주입 시 CSS fallback 적용 확인 |
| Keyboard | 실제 IME show/hide PASS; 열린 상태 viewport 272px, 입력 하단 162px로 키보드 위에 위치 |
| Android back | 날짜 sheet, 삭제 modal, 프로필 sheet, 기간 sheet 닫기 → route 복귀 → Home Activity 종료 PASS |
| 종료 → 재시작 | force-stop → cold start → 감정 fixture 초안 복원 PASS |
| 외부 브라우저 UI | 모든 화면 foreground `com.addi.app/.MainActivity`, URL `https://localhost/...`; 외부 URL navigation 강제 시도도 차단 |
| API/network | `/api/moods/analyze` 차단, 실제 remote request 0, JS page error 0 |
| 보호 tests | local bundle / web-TWA diff / release gate 3 tests PASS |
| Release | app release variant 비활성, `app:bundleRelease`·`app:assembleRelease` 없음. 라이브러리 release tasks와는 구분 |

시간 값은 emulator 단일 실행 관측이며 실기기 성능 보장은 아닙니다. Android QA viewport 높이는 592 CSS px로, 키보드가 없는 짧은 화면에서도 검사했습니다.

## Evidence

- [Android machine-readable results](evidence/android-results.json)
- [Browser machine-readable results](evidence/web-results.json)
- [Home](evidence/390-home.png) · [약 목록](evidence/390-medications.png) · [감정 기록](evidence/390-moods.png)
- [내원 일정](evidence/390-visits.png) · [알림](evidence/390-notifications.png) · [마이](evidence/390-my.png)
- [Keyboard open](evidence/keyboard-open.png) · [Keyboard closed](evidence/keyboard-closed.png)
- [Native Splash](evidence/splash-1.png)

추가 전체 screenshots와 cold-start 영상은 로컬 `qa-artifacts/android/`에 있습니다. APK/영상/build output은 commit하지 않았습니다.

## UI reuse / remaining adapters

대표 6화면의 JSX와 공유 CSS 원본을 수정하지 않고 직접 import했습니다. 내원일 수정, 감정 질문/입력, 감정 상세, 복용시간 수정도 공유합니다. API가 필요한 약품 검색·AI 결과 완료·계정 기능·알림 설정은 후속 adapter 구현이 필요합니다. fixture의 인증/구독 상태는 화면 표시용 값이며 실제 권한이나 세션이 아닙니다.

## Production impact: 0

- 수정된 기존 파일은 `tsconfig.json`의 native 패키지 제외뿐.
- 웹 UI/CSS, 루트 package/lockfile, Next API/proxy/auth, Supabase/DB migrations, reminders, Web Push, `public/sw.js`, PWA manifest, 기존 루트 TWA `android/` 변경 0.
- 원본 dirty checkout의 파일 SHA-256, Git status, staged/unstaged diff 모두 작업 전과 동일.
- 원격 main은 기준 SHA와 동일. main merge/push, Vercel Production 배포, Play Console 변경, release signing, 실제 Push 발송 0.
- 환경변수/credential을 가져오지 않았고 Production endpoint를 연결하지 않음.

## Limits and next phases

- 실제 Galaxy, Android API 24–35, 최신 WebView의 edge-to-edge/cutout, landscape/분할화면, 접근성 확대는 미검증. 현재 emulator 결과를 모든 기기 보장으로 확대하지 않음.
- Phase 2에서 OAuth system browser callback, PKCE/state, 기존 계정의 동일 user_id, Native secure session/refresh, bearer API 인증/CORS, account-scoped storage 및 logout/delete cleanup 구현 필요.
- Phase 3에서 FCM/token ownership/revocation, native permission, notification tap, Web Push와 중복 방지 및 scheduler transport 확장 검증 필요.
- API 23 기기 지원은 별도 검토. 이번 minSdk는 24이며 기존 TWA/Play의 지원 범위를 바꾸지 않음.
- Play package/signing/versionCode migration은 별도 단계. 이번 APK를 기존 Play 설치본 위에 설치하지 않음.
