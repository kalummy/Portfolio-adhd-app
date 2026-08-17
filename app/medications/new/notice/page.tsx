"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { saveMedicationDraft } from "@/lib/indexed-db";
import {
  clearDraft,
  getDraft,
  registrationHref,
  setLastSavedMedicationIds,
  updateDraft,
} from "@/lib/registration-session";

const notices = [
  "아디의 의약품 정보는 식품의약품안전처의 제품 허가정보와 낱알식별정보를 바탕으로 정리했어요.",
  "현재 일부 의약품 정보만 제공해요.",
  "검색 및 사진 인식 결과가 실제 처방약과 일치하는지 직접 확인해주세요.",
  "아디는 복약과 상태 기록을 돕는 서비스예요.",
  "약의 선택·변경·복용량 추천 등 의료적 판단은 제공하지 않아요.",
  "복용과 치료에 관한 결정은 의사 또는 약사와 상의해주세요.",
];

export default function MedicationNoticePage() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setAccepted(getDraft().noticeAccepted), []);

  async function save() {
    if (!accepted || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveMedicationDraft(getDraft());
      setLastSavedMedicationIds(saved.map((medication) => medication.id));
      clearDraft();
      router.push(registrationHref("/medications/new/complete"));
    } catch {
      setError("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
      setSaving(false);
    }
  }

  return (
    <MobileShell className="flow-screen notice-screen">
      <FlowHeader fallbackHref={registrationHref("/medications/new/review")} />
      <section className="flow-content notice-content">
        <h1>아래 내용을<br />꼭 확인해주세요</h1>
        <ul className="notice-list">
          {notices.map((notice) => <li key={notice}>{notice}</li>)}
        </ul>
      </section>
      <BottomActions>
        <label className="agreement-row">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => {
              setAccepted(event.target.checked);
              updateDraft({ noticeAccepted: event.target.checked });
            }}
          />
          <span className="checkbox-mark" aria-hidden="true">
            <Image
              src={accepted ? "/icons/checkbox-checked.svg" : "/icons/checkbox-unchecked.svg"}
              alt=""
              width={20}
              height={20}
            />
          </span>
          <strong>안내사항을 확인했으며, 모두 동의합니다.</strong>
        </label>
        {error ? <p className="save-error" role="alert">{error}</p> : null}
        <PrimaryButton type="button" disabled={!accepted || saving} onClick={save}>
          {saving ? "저장 중..." : "확인했어요"}
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
