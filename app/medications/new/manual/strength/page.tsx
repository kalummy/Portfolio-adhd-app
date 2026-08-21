"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { createManualMedicationCandidate } from "@/lib/medication-candidates";
import {
  confirmPendingCandidates,
  getDraft,
  registrationHref,
  setPendingCandidates,
  updateDraft,
} from "@/lib/registration-session";
import type { MedicationCandidate, OfficialMedicationMatchStatus } from "@/lib/types";

type ManualMatchResponse = {
  status?: OfficialMedicationMatchStatus;
  medication?: MedicationCandidate;
};

export default function ManualMedicationStrengthPage() {
  const router = useRouter();
  const [strength, setStrength] = useState("");
  const [matching, setMatching] = useState(false);

  useEffect(() => setStrength(getDraft().manualStrength), []);

  async function continueToConfirm() {
    if (matching) return;
    const draft = getDraft();
    const strengthValue = Number(strength);
    if (!draft.manualName.trim() || !strengthValue) return;

    setMatching(true);
    let medication: MedicationCandidate;
    try {
      const parameters = new URLSearchParams({
        name: draft.manualName.trim(),
        strength: String(strengthValue),
      });
      const response = await fetch(`/api/medications/manual-match?${parameters.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("official matching unavailable");
      const result = await response.json() as ManualMatchResponse;
      medication = result.status === "matched" && result.medication
        ? result.medication
        : createManualMedicationCandidate(
            draft.manualName,
            strengthValue,
            result.status === "ambiguous" ? "ambiguous" : "not-found",
          );
    } catch {
      medication = createManualMedicationCandidate(
        draft.manualName,
        strengthValue,
        "unavailable",
      );
    }

    updateDraft({ manualStrength: strength });
    setPendingCandidates([medication], "manual");
    confirmPendingCandidates();
    router.push(registrationHref("/medications/new/review"));
  }

  return (
    <MobileShell className="flow-screen">
      <FlowHeader fallbackHref={registrationHref("/medications/new/manual/name")} />
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
              updateDraft({ manualStrength: value, pendingCandidates: [] });
            }}
            autoFocus
          />
          <span>mg</span>
        </div>
      </section>
      <BottomActions>
        <PrimaryButton
          type="button"
          disabled={!Number(strength) || matching}
          onClick={() => void continueToConfirm()}
        >
          다음
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
