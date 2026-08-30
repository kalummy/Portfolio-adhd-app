# ADDI Android TWA

이 디렉터리는 Bubblewrap으로 생성한 ADDI의 Trusted Web Activity 프로젝트다.

- 패키지 ID: `com.addi.app`
- 앱 이름: `아디`
- Production origin: `https://addi-gamma.vercel.app`
- 시작 URL: `https://addi-gamma.vercel.app/`
- 버전: `1.0.0` (`versionCode` 1)
- SDK: `compileSdk 36`, `targetSdk 36`

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

Digital Asset Links에는 upload key 지문이 아니라 Play Console의 **App signing key certificate SHA-256 fingerprint**를 넣어야 한다. Play Console의 `설정 > 앱 무결성 > 앱 서명`에서 SHA-256 인증서 지문을 복사한 뒤 `public/.well-known/assetlinks.json`의 `sha256_cert_fingerprints` 배열에 추가한다.

지문이 확정되기 전까지 배열은 의도적으로 비어 있으며, 이 상태에서는 TWA의 주소창 제거를 위한 도메인 검증이 완료되지 않는다.

## 비서명 빌드 확인

JDK 17과 Android SDK를 준비한 다음 Android 프로젝트에서 실행한다.

```bash
npx @bubblewrap/cli build --skipSigning --skipPwaValidation
```

실제 AAB 생성 시에는 안전한 로컬 경로의 upload key를 `--signingKeyPath`로 지정하고 비밀번호는 Bubblewrap 환경 변수 또는 대화형 입력으로만 제공한다. 키 파일과 비밀번호를 Git에 추가하지 않는다.
