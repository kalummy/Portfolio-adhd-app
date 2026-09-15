import { useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { FlowHeader } from "@/components/flow-ui";
import { sendNativeQa } from "./runtime";
/** Dev-only route. Server requires the separately selected singleton installation. */
export function NativePushQaScreen() {
  const [message, setMessage] = useState(
    "관리자가 지정한 Dev 기기에만 발송돼요.",
  );
  const [busy, setBusy] = useState(false);
  async function send(kind: "daily" | "mood" | "visit_day_today") {
    setBusy(true);
    try {
      await sendNativeQa(kind);
      setMessage("발송 요청이 접수됐어요. 알림을 확인해주세요.");
    } catch {
      setMessage("발송할 수 없어요. 기기 지정과 알림 설정을 확인해주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <MobileShell className="flow-screen">
      <FlowHeader title="Dev 알림 확인" fallbackHref="/my" />
      <section style={{ padding: 20 }}>
        <p>{message}</p>
        {(
          [
            ["daily", "복약"],
            ["mood", "감정"],
            ["visit_day_today", "내원"],
          ] as const
        ).map(([kind, label]) => (
          <button
            className="flow-primary-button"
            disabled={busy}
            key={kind}
            onClick={() => void send(kind)}
          >
            {label} 테스트
          </button>
        ))}
        <a href="/notifications/settings">알림 설정</a>
      </section>
    </MobileShell>
  );
}
