"use client";

import Image from "next/image";
import { BottomActions, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { MoodLottie } from "@/components/mood-lottie";
import type { MoodResultData } from "@/lib/mood-summary";

type MoodResultProps = {
  result: MoodResultData;
  hasAnimation: boolean;
  saving: boolean;
  onRestart: () => void;
  onSave: () => void;
};

function getShareText(result: MoodResultData) {
  return [
    "오늘 체크해야할 점",
    ...result.checkItems.map((item) => `• ${item}`),
    "",
    "병원에서 이렇게 이야기 해보세요",
    `“${result.clinicPhrase}”`,
  ].join("\n");
}

async function shareMoodResult(result: MoodResultData) {
  if (typeof navigator.share !== "function") return;
  try {
    await navigator.share({ title: "감정 기록 완료", text: getShareText(result) });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
}

export function MoodResult({ result, hasAnimation, saving, onRestart, onSave }: MoodResultProps) {
  return (
    <MobileShell className="flow-screen mood-result-screen">
      <header className="mood-result-header">
        <strong>감정 기록 완료</strong>
        <button className="icon-button mood-result-share" type="button" aria-label="감정 기록 공유하기"
          onClick={() => void shareMoodResult(result)}>
          <Image src="/icons/mood-share.svg" alt="" width={18} height={18} />
        </button>
      </header>

      <section className="mood-result-content">
        <div className="mood-result-animation-frame">
          {hasAnimation ? <MoodLottie className="mood-result-animation" src="/lottie/mood-complete.json" loop={false} /> : null}
        </div>
        <div className="mood-result-heading">
          <h1>기록이 완료 되었어요!</h1>
          <p>오늘 요약을 확인해보세요.</p>
        </div>

        <section className="mood-check-card">
          <h2><Image src="/icons/mood-summary-sparkle.svg" alt="" width={20} height={20} />오늘 체크해야할 점</h2>
          <ul>{result.checkItems.map((item) => <li key={item}><span aria-hidden="true" /><p>{item}</p></li>)}</ul>
        </section>

        <section className="mood-clinic-card">
          <h2><Image src="/icons/mood-summary-sparkle.svg" alt="" width={20} height={20} />병원에서 이렇게 이야기 해보세요</h2>
          <p>“{result.clinicPhrase}”</p>
        </section>
      </section>

      <BottomActions>
        <div className="split-actions mood-result-actions">
          <PrimaryButton type="button" variant="soft" onClick={onRestart} disabled={saving}>다시 하기</PrimaryButton>
          <PrimaryButton type="button" onClick={onSave} disabled={saving}>저장</PrimaryButton>
        </div>
      </BottomActions>
    </MobileShell>
  );
}
