"use client";

import { useEffect, useRef, useState } from "react";
import type { E2EOffer } from "@/lib/push/e2e-offer";
import { createE2EClick, type E2EClickResult } from "@/lib/push/e2e-click";

const RESULT_MESSAGE: Record<E2EClickResult, string> = {
  accepted: "발송 요청이 접수됐어요. 알림 도착과 ADDI 앱 표시를 확인해주세요.",
  failed: "발송을 완료하지 못했어요. 다시 누르지 말고 결과 확인을 기다려주세요.",
  unknown: "발송 결과를 확인하지 못했어요. 다시 누르지 말고 결과 확인을 기다려주세요.",
  blocked: "이미 요청했거나 테스트 시간이 지났어요. 결과 확인을 기다려주세요.",
};

export function PushE2EButton({ offer, previewOnly = false }: { offer: E2EOffer; previewOnly?: boolean }) {
  const [usable, setUsable] = useState(false);
  const [message, setMessage] = useState("");
  const attempted = useRef(false);
  const execute = useRef<ReturnType<typeof createE2EClick> | null>(null);

  useEffect(() => {
    const remaining = Date.parse(offer.expiresAt) - Date.now();
    try {
      setUsable(remaining > 0 && !sessionStorage.getItem(`addi:push-e2e-attempt:${offer.runId}`));
    } catch { setUsable(false); }
    const timer = setTimeout(() => setUsable(false), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [offer.runId, offer.expiresAt]);

  async function onClick() {
    if (attempted.current || !usable) return;
    attempted.current = true;
    setUsable(false);
    setMessage("발송 결과를 확인하고 있어요.");
    if (previewOnly) {
      // Preview-only fixture: no request, auth, DB, or provider access.
      setMessage("미리보기: 모의 발송 요청 1회 완료. 실제 알림은 보내지 않았어요.");
      return;
    }
    try {
      execute.current ??= createE2EClick({ runId: offer.runId, expiresAt: offer.expiresAt,
        storage: sessionStorage, fetch: window.fetch.bind(window), now: Date.now });
      setMessage(RESULT_MESSAGE[await execute.current()]);
    } catch {
      setMessage(RESULT_MESSAGE.blocked);
    }
  }

  return (
    <div style={{ margin: "24px 20px 0" }}>
      <button type="button" className="primary-button secondary" disabled={!usable} onClick={onClick}>
        알림 테스트
      </button>
      {message ? <p role="status" style={{ marginTop: 12, fontSize: 14 }}>{message}</p> : null}
    </div>
  );
}
