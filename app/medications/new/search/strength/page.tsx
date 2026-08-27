"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import {
  createFrequentMedicationCandidate,
  getFrequentMedicationGroup,
} from "@/lib/frequent-medications";
import { enrichOfficialMedication } from "@/lib/medication-enrichment";
import {
  confirmPendingCandidates,
  registrationHref,
  setPendingCandidates,
} from "@/lib/registration-session";

function FrequentMedicationStrengthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const group = getFrequentMedicationGroup(searchParams.get("group"));
  const [selectedStrength, setSelectedStrength] = useState<number>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!group) {
      router.replace(registrationHref("/medications/new/search"));
    }
  }, [group, router]);

  if (!group) return <MobileShell className="flow-screen">{null}</MobileShell>;

  async function continueWithStrength() {
    if (!group || !selectedStrength || saving) return;
    setSaving(true);
    try {
      const medication = createFrequentMedicationCandidate(group, selectedStrength);
      const enrichedMedication = await enrichOfficialMedication(medication);
      setPendingCandidates([enrichedMedication], "search");
      confirmPendingCandidates();
      router.push(registrationHref("/medications/new/review"));
    } catch {
      setSaving(false);
    }
  }

  return (
    <MobileShell className="flow-screen schedule-screen">
      <FlowHeader fallbackHref={registrationHref("/medications/new/search")} />
      <section className="flow-content schedule-content">
        <h1>{group.label} 용량을 선택해주세요</h1>
        <div className="schedule-options" role="radiogroup" aria-label={`${group.label} 용량`}>
          {group.strengths.map((strengthValue) => (
            <button
              type="button"
              role="radio"
              aria-checked={selectedStrength === strengthValue}
              className={`schedule-option ${selectedStrength === strengthValue ? "selected" : ""}`}
              key={strengthValue}
              onClick={() => setSelectedStrength(strengthValue)}
            >
              <span className="radio-mark" aria-hidden="true">
                {selectedStrength === strengthValue ? (
                  <Image src="/icons/radio-selected.svg" alt="" width={20} height={20} />
                ) : (
                  <>
                    <Image className="radio-default-outer" src="/icons/radio-default-outer.svg" alt="" width={20} height={20} />
                    <Image className="radio-default-inner" src="/icons/radio-default-inner.svg" alt="" width={8} height={8} />
                  </>
                )}
              </span>
              <strong>{strengthValue}mg</strong>
            </button>
          ))}
        </div>
      </section>
      <BottomActions>
        <PrimaryButton
          type="button"
          disabled={!selectedStrength || saving}
          aria-busy={saving}
          onClick={() => void continueWithStrength()}
        >
          {saving ? "확인 중..." : "다음"}
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}

export default function FrequentMedicationStrengthPage() {
  return (
    <Suspense fallback={<MobileShell className="flow-screen">{null}</MobileShell>}>
      <FrequentMedicationStrengthContent />
    </Suspense>
  );
}
