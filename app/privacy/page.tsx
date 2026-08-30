import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LegalPage, type LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "ADDI 개인정보처리방침",
  description: "ADDI가 처리하는 정보와 저장·이용·삭제 방법을 안내합니다.",
};

const POLICY_MARKDOWN = `## 1. 처리하는 개인정보
ADDI는 서비스 이용 과정에서 다음 정보를 처리할 수 있습니다.

### 1) 계정 및 로그인 정보
ADDI는 Google 또는 Kakao 계정을 이용한 간편 로그인을 제공합니다.

Google 로그인
- 서비스 내 사용자 식별정보
- 이메일 주소
- 이름 및 표시 이름
- 프로필 이미지 등 Google이 로그인 과정에서 제공하는 계정 정보

Kakao 로그인
- 서비스 내 사용자 식별정보
- 닉네임 또는 표시 이름 등 이용자가 동의한 범위에서 Kakao가 제공하는 계정 정보

소셜 로그인 제공자가 실제로 제공하는 정보는 이용자의 계정 설정 및 각 제공자의 동의 범위에 따라 달라질 수 있습니다.

ADDI는 소셜 로그인 과정에서 제공받은 프로필 이미지를 현재 서비스 화면의 프로필 이미지로 사용하지 않을 수 있습니다.

### 2) 약 및 복용 기록
이용자가 복약 관리 기능을 사용하는 경우 다음 정보가 처리될 수 있습니다.

- 약 이름
- 성분명
- 함량 및 단위
- 제조사
- 의약품 검색 및 매칭 정보
- 복용 일정 및 예정 시각
- 약 등록 및 사용 상태
- 실제 복용일 및 복용 기록 시각

### 3) 감정 및 상태 기록
감정 기록 기능을 사용하는 경우 다음 정보가 처리될 수 있습니다.

- 선택한 감정
- 약효에 관한 응답
- 집중 상태
- 감정 상태
- 관계에 관한 응답
- 기록 시간대
- 이용자가 직접 입력한 자유 문구
- 서비스가 생성한 감정 요약
- 진료 시 참고하기 위한 요약 문구
- AI 분석 결과 및 분석 상태

이 정보에는 이용자의 건강 상태 또는 정서 상태와 관련된 내용이 포함될 수 있습니다.

### 4) 내원 일정
이용자가 내원 일정 기능을 사용하는 경우 다음 정보가 처리될 수 있습니다.

- 내원 예정일
- 일정 식별정보

### 5) 피드백
이용자가 서비스에 의견을 제출하는 경우 다음 정보가 처리될 수 있습니다.

- 이용자가 직접 작성한 피드백
- 피드백을 제출한 서비스 화면 또는 경로
- 제출 시각
- 로그인 상태에서 제출한 경우 사용자 식별정보

이용자가 피드백에 건강 관련 내용을 직접 작성하는 경우 해당 내용이 포함될 수 있습니다.

### 6) 서비스 이용 기록
서비스 품질 개선 및 이용 현황 분석을 위해 다음과 같은 정보가 처리될 수 있습니다.

- 서비스 실행 및 화면 이용 기록
- 로그인 시작 및 완료 여부
- 약 등록·수정 등 주요 기능 이용 기록
- 복용 기록 기능 이용 여부
- 감정 기록 기능 이용 여부
- 내원 일정 기능 이용 여부
- 화면 이동 및 날짜 선택 정보
- 기능의 성공·실패 여부
- 브라우저, 운영체제, 화면 및 기기와 관련하여 분석 도구가 제공하는 기술적 정보
- 익명 또는 기기 기반 분석 식별자

ADDI는 행동 분석 이벤트에 감정 자유 입력 내용이나 약 이름 등을 직접 포함하지 않도록 구성하고 있습니다.

## 2. 개인정보의 이용 목적
- 회원 식별 및 로그인 상태 유지
- 사용자별 기록의 안전한 저장 및 조회
- 약 등록 및 복용 일정 관리
- 복용 이력 제공
- 감정 및 상태 기록 제공
- 감정 기록을 기반으로 한 분석 및 요약 제공
- 내원 일정 관리
- 사용자 문의 및 피드백 처리
- 서비스 오류 확인 및 안정성 개선
- 서비스 이용 현황 및 주요 기능의 사용성 분석
- 서비스 개선을 위한 통계 분석
- 부정 이용 및 보안 문제 대응

## 3. 건강 관련 정보의 처리
ADDI는 복약 및 상태 기록 서비스를 제공하기 위해 이용자가 직접 입력한 건강 관련 정보를 처리할 수 있습니다.

여기에는 다음 정보가 포함될 수 있습니다.

- 복용 중인 의약품
- 복용 일정 및 실제 복용 기록
- 약효에 관한 기록
- 집중 및 감정 상태에 관한 기록
- 이용자가 직접 작성한 감정 관련 내용
- 감정 기록을 기반으로 생성된 AI 분석 결과
- 내원 예정일

해당 정보는 이용자에게 복약 및 상태 기록 기능을 제공하기 위한 목적으로 처리됩니다.

## 4. 소셜 로그인
ADDI는 회원 인증을 위해 다음 외부 로그인 서비스를 이용합니다.

- Google OAuth
- Kakao Login

소셜 로그인 과정에서 ADDI는 이용자가 각 로그인 제공자에게 허용한 범위의 계정 정보를 제공받습니다.

Google 및 Kakao 계정 자체의 관리, 로그인 동의 내역 및 해당 사업자가 직접 처리하는 정보에는 각 서비스 제공자의 개인정보처리방침이 적용됩니다.

## 5. AI를 이용한 감정 기록 분석
ADDI는 이용자가 작성한 감정 기록을 분석하고 요약 정보를 제공하기 위해 OpenAI의 API를 이용할 수 있습니다.

AI 분석 과정에서 다음 정보가 전달될 수 있습니다.

- 감정 및 상태에 대한 선택 응답
- 약효 및 집중 상태에 대한 응답
- 관계에 대한 응답
- 감정 기록 시각 등 분석에 필요한 기록 정보
- 이용자가 직접 작성한 자유 입력 내용
- 해당 날짜에 복용 기록이 존재하는지 여부

ADDI는 AI 분석을 위해 의약품의 구체적인 이름이나 내부 의약품 식별자를 OpenAI에 직접 전달하지 않도록 구성하고 있습니다.

AI가 생성한 분석 결과는 이용자의 기록 확인을 돕기 위한 정보이며, 의료인의 진단·처방 또는 전문적인 의료행위를 대신하지 않습니다.

## 6. 행동 분석 및 서비스 개선
ADDI는 서비스 이용 현황과 기능 개선을 위해 Mixpanel을 이용합니다.

Mixpanel을 통해 서비스 실행, 화면 이용, 로그인, 약 등록, 복용 기록, 감정 기록, 내원 일정 및 기타 주요 기능의 이용 이벤트가 처리될 수 있습니다.

이 과정에서 익명 또는 기기 기반 식별자와 브라우저·운영체제 등 기술적 정보가 함께 처리될 수 있습니다.

ADDI는 Supabase 회원 UUID를 Mixpanel의 사용자 프로필에 직접 연결하여 식별하는 방식은 현재 사용하지 않습니다.

## 7. 외부 서비스 이용
ADDI는 서비스 제공을 위해 다음과 같은 외부 서비스를 이용할 수 있습니다.

| 서비스 | 이용 목적 |
| Supabase | 회원 인증, 사용자별 데이터 저장 및 관리 |
| Google | Google 계정을 이용한 로그인 |
| Kakao | Kakao 계정을 이용한 로그인 |
| Vercel | 웹 서비스 및 서버 기능 제공 |
| OpenAI | 감정 기록 분석 및 요약 |
| Mixpanel | 서비스 이용 현황 및 행동 분석 |
| 공공데이터포털·식품의약품안전처 관련 API | 의약품 검색 및 정보 확인 |
| Tesseract.js 및 관련 리소스 | 처방전 이미지의 브라우저 내 문자 인식 |

각 외부 서비스는 서비스 제공에 필요한 범위에서 정보를 처리할 수 있으며, 해당 사업자가 독립적으로 처리하는 정보에는 각 사업자의 개인정보 보호 정책이 적용될 수 있습니다.

## 8. 처방전 이미지 및 OCR 처리
이용자가 처방전 인식 기능을 사용하는 경우 선택한 이미지는 문자 인식을 위해 브라우저에서 처리될 수 있습니다.

ADDI는 현재 처방전 이미지 원본과 OCR을 통해 인식된 전체 문서를 사용자 데이터베이스에 저장하지 않습니다.

다만 인식된 약 이름 및 함량 등의 후보 정보는 의약품을 검색하고 확인하기 위해 ADDI 서버 및 의약품 정보 제공 API에 전달될 수 있습니다.

## 9. 기기 내 정보 저장
ADDI는 서비스 제공을 위해 이용자의 브라우저 또는 기기에 일부 정보를 저장할 수 있습니다.

사용되는 저장 방식에는 다음이 포함될 수 있습니다.

- IndexedDB
- localStorage
- sessionStorage
- 인증을 위한 Cookie

기기에는 약·복용·감정·내원 기록, 작성 중인 입력 내용, 서비스 상태 정보 및 분석 도구에서 사용하는 익명 식별자 등이 일시적 또는 지속적으로 저장될 수 있습니다.

기존 기기 내 기록을 로그인 계정으로 이전하는 과정에서는 해당 기록이 서버의 사용자 계정에 연결될 수 있습니다.

## 10. 개인정보의 보유 및 삭제
ADDI는 서비스 제공에 필요한 기간 동안 이용자의 정보를 보유합니다.

회원이 ADDI에서 회원탈퇴를 완료하면 ADDI가 직접 관리하는 범위에서 해당 계정과 연결된 다음 정보를 삭제합니다.

- ADDI 회원 계정
- 등록한 약 정보
- 복용 기록
- 감정 및 상태 기록
- 감정 AI 분석 결과
- 내원 일정
- 사용자 계정과 연결된 피드백
- 사용자 계정과 연결된 기타 서비스 데이터
- 현재 기기에 저장된 ADDI 관련 사용자 기록

다만 관련 법령에 따라 일정 기간 보관해야 하는 정보가 있는 경우에는 해당 기간 동안 별도로 보관할 수 있습니다.

또한 서비스 운영 과정에서 생성된 백업, 보안 로그 또는 외부 처리 서비스가 보유하는 기술적 기록은 각 서비스의 보유 및 삭제 정책에 따라 일정 기간 잔존할 수 있습니다.

## 11. 회원탈퇴 및 계정 삭제
이용자는 ADDI 앱 내 회원탈퇴 기능을 이용하여 언제든지 계정 삭제를 요청할 수 있습니다.

회원탈퇴가 정상적으로 완료되면 ADDI가 직접 관리하는 회원 계정과 해당 계정에 연결된 사용자 기록이 삭제됩니다.

Google 또는 Kakao 계정을 이용하여 가입한 경우 ADDI 회원탈퇴는 해당 Google 또는 Kakao 계정 자체를 삭제하는 것을 의미하지 않습니다.

외부 로그인 제공자와의 연결 또는 동의 내역은 해당 서비스의 계정 설정에서도 별도로 관리할 수 있습니다.

## 12. 개인정보의 안전성 확보
ADDI는 이용자의 정보를 보호하기 위해 다음과 같은 기술적 조치를 적용합니다.

- 사용자 인증을 통한 데이터 접근 제한
- 사용자별 데이터 접근 권한 분리
- 서버 전용 관리자 권한 정보의 클라이언트 비노출
- 인증 세션 관리
- 서비스 제공에 필요한 최소 범위의 외부 데이터 전송
- 회원탈퇴 시 계정 및 관련 사용자 데이터 삭제

## 13. 이용자의 권리
이용자는 자신의 개인정보 및 서비스 기록에 대해 다음과 같은 권리를 행사할 수 있습니다.

- 자신의 서비스 기록 확인
- 제공되는 기능 범위에서 기록 수정 또는 삭제
- 회원탈퇴 및 계정 삭제
- 개인정보 처리와 관련된 문의

개인정보 처리와 관련하여 문의가 필요한 경우 아래 연락처를 이용할 수 있습니다.

## 14. 개인정보 관련 문의
서비스명: ADDI(아디)

운영자: kalummy

이메일: kalummy0427@kakao.com

개인정보 처리와 관련된 문의는 위 이메일로 접수할 수 있습니다.

## 15. 개인정보처리방침의 변경
본 개인정보처리방침은 관련 법령, 서비스 기능 또는 개인정보 처리 방식의 변경에 따라 수정될 수 있습니다.

중요한 변경사항이 있는 경우 서비스 내 공지 또는 기타 적절한 방법을 통해 안내합니다.

시행일: 2026년 8월 30일`;

function tableCells(line: string) {
  return line.slice(1, -1).split("|").map((cell) => cell.trim());
}

function renderPolicyContent(body: string) {
  const lines = body.split("\n");
  const blocks: ReactNode[] = [];

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push(<h3 key={`heading-${index}`}>{line.slice(4)}</h3>);
      index += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2));
        index += 1;
      }
      blocks.push(<ul key={`list-${index}`}>{items.map((item) => <li key={item}>{item}</li>)}</ul>);
      continue;
    }
    if (line.startsWith("| ")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("| ")) {
        rows.push(tableCells(lines[index].trim()));
        index += 1;
      }
      const [headings, ...values] = rows;
      blocks.push(
        <div className="legal-table-wrap" key={`table-${index}`}>
          <table>
            <thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
            <tbody>{values.map((row) => <tr key={row[0]}>{row.map((cell, cellIndex) => <td key={`${row[0]}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    blocks.push(<p key={`paragraph-${index}`}>{line}</p>);
    index += 1;
  }

  return <div className="legal-policy-blocks">{blocks}</div>;
}

const sections: LegalSection[] = POLICY_MARKDOWN.split("\n## ").map((rawSection) => {
  const normalized = rawSection.startsWith("## ") ? rawSection.slice(3) : rawSection;
  const newlineIndex = normalized.indexOf("\n");
  const numberedTitle = normalized.slice(0, newlineIndex);
  return {
    title: numberedTitle.replace(/^\d+\.\s*/u, ""),
    content: renderPolicyContent(normalized.slice(newlineIndex + 1)),
  };
});

export default function PrivacyPage() {
  return (
    <LegalPage
      className="privacy-policy-screen"
      title="ADDI 개인정보처리방침"
      intro="ADDI(이하 “서비스”)는 이용자의 개인정보를 중요하게 생각하며, 서비스 제공에 필요한 범위에서 개인정보 및 이용자가 입력한 정보를 처리합니다. 본 개인정보처리방침은 ADDI가 어떠한 정보를 수집·이용하고, 어디에 저장하며, 이용자가 자신의 정보를 어떻게 관리하거나 삭제할 수 있는지 안내합니다."
      sections={sections}
      published={{ effectiveDate: "시행일: 2026년 8월 30일" }}
    />
  );
}
