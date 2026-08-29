"use client";

import Image from "next/image";
import { CatRewardImage } from "@/components/cat-reward-image";
import { BottomActions, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { getCat, type CatId } from "@/lib/cats";
import { normalizeClinicPhraseForDisplay } from "@/lib/clinic-phrase";
import type { MoodResultData } from "@/lib/mood-summary";

type MoodResultProps = {
  catId: CatId;
  result: MoodResultData;
  saving: boolean;
  saveError?: string;
  onSave: () => void;
};

function getShareText(result: MoodResultData) {
  const clinicPhrase = normalizeClinicPhraseForDisplay(result.clinicPhrase);
  return [
    "오늘 내 감정",
    ...result.checkItems.map((item) => `• ${item}`),
    "",
    "병원에서 이렇게 이야기 해보세요",
    `“${clinicPhrase}”`,
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

export function MoodResult({
  catId,
  result,
  saving,
  saveError,
  onSave,
}: MoodResultProps) {
  const cat = getCat(catId);
  const clinicPhrase = normalizeClinicPhraseForDisplay(result.clinicPhrase);
  return (
    <MobileShell className="flow-screen mood-result-screen">
      <header className="mood-result-header">
        <strong>감정 기록 완료</strong>
        <button
          className="icon-button mood-result-share"
          type="button"
          aria-label="감정 기록 공유하기"
          onClick={() => void shareMoodResult(result)}
        >
          <Image src="/icons/mood-share.svg" alt="" width={18} height={18} />
        </button>
      </header>
      <section className="mood-result-content">
        <div className="mood-result-heading">
          <h1>{cat.displayName}가 나왔어요!</h1>
          <p>오늘의 감정기록을 확인해주세요.</p>
        </div>
        <div className={`mood-result-cat-frame mood-result-cat-${catId}`}>
          <CatRewardImage
            catId={catId}
            alt={cat.displayName}
            width={160}
            height={160}
            priority
          />
        </div>
        <section className="mood-check-card">
          <h2>
            <Image src="/icons/mood-summary-sparkle.svg" alt="" width={20} height={20} />
            오늘 내 감정
          </h2>
          <ul>
            {result.checkItems.map((item, index) => (
              <li key={`${index}:${item}`}><span aria-hidden="true" /><p>{item}</p></li>
            ))}
          </ul>
        </section>
        <section className="mood-clinic-card">
          <h2>
            <Image src="/icons/mood-summary-sparkle.svg" alt="" width={20} height={20} />
            병원에서 이렇게 이야기 해보세요
          </h2>
          <p>“{clinicPhrase}”</p>
        </section>
      </section>
      <BottomActions>
        {saveError ? (
          <p className="mood-save-error" role="alert">{saveError}</p>
        ) : null}
        <PrimaryButton
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
        >
          {saving ? "저장 중..." : saveError ? "다시 시도" : "저장"}
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
