# 앱 버전 업데이트 정책

Android TWA 버전과 업데이트 정책은 [`config/app-version.ts`](../config/app-version.ts)에서만 변경한다.

- `currentAppVersion`: 새 Android 패키지에 넣을 `versionName`
- `minimumSupportedAppVersion`: 이 값보다 낮으면 필수 업데이트
- `latestAppVersion`: 이 값보다 낮고 최소 지원 버전 이상이면 선택 업데이트

웹은 공개 `/api/app-version`에서 정책을 읽는다. 요청 실패, 잘못된 버전 값, 잘못된 정책은 모두 업데이트를 표시하지 않는 fail-open으로 처리한다.

## TWA launch URL

Bubblewrap의 `twa-manifest.json`에 정적 launch query를 전달한다.

```text
/?addi_platform=android-twa&addi_version=<versionName>
```

`<versionName>`은 같은 릴리스의 `config/app-version.ts`의 `currentAppVersion`과 일치해야 한다. 웹은 이 값을 session storage에 보존하므로 같은 탭에서 HTTPS OAuth 왕복 후에도 TWA 상태를 유지한다.

## 로컬 및 Preview QA

아래 query는 `localhost`, `127.0.0.1`, Production이 아닌 Vercel Preview에서만 적용되며 TWA launch query와 함께 사용한다.

- 선택 업데이트: `addi_qa_min=<current>&addi_qa_latest=<higher>`
- 필수 업데이트: `addi_qa_min=<higher>&addi_qa_latest=<higher-or-equal>`
- 정책 요청 실패: `addi_qa_policy=network-error`

Production 호스트 `addi-gamma.vercel.app`에서는 QA 정책 override를 무시한다.
