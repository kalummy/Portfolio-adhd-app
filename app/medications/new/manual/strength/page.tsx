"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { enrichManualMedication } from "@/lib/mock-medications";
import { getDraft, updateDraft } from "@/lib/registration-session";

export default function ManualMedicationStrengthPage() {
  const router = useRouter();
  const [strength, setStrength] = useState("");

  useEffect(() => setStrength(getDraft().manualStrength), []);

  function continueToConfirm() {
    const draft = getDraft();
    const strengthValue = Number(strength);
    if (!draft.manualName.trim() || !strengthValue) return;
    const medication = enrichManualMedication(draft.manualName, strengthValue);
    updateDraft({ method: "manual", manualStrength: strength, medications: [medication] });
    router.push("/medications/new/confirm");
  }

  return (
    <MobileShell className="flow-screen">
      <FlowHeader />
      <section className="flow-content input-content">
        <h1>복용중인 약의 용량을 입력해주세요</h1>
        <div className="strength-field">
          <input
            id="manual-strength"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="예) 36"
            value={strength}
            onChange={(event) => {
              const value = event.target.value.replace(/\D/g, "");
              setStrength(value);
              updateDraft({ manualStrength: value, medications: [] });
            }}
            autoFocus
          />
          <span>mg</span>
        </div>
      </section>
      <BottomActions>
        <PrimaryButton type="button" disabled={!Number(strength)} onClick={continueToConfirm}>
          다음
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
