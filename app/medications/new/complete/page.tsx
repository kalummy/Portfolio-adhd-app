"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { getSavedMedicationsByIds } from "@/lib/indexed-db";
import { getLastSavedMedicationIds } from "@/lib/registration-session";
import type { SavedMedication } from "@/lib/types";

export default function MedicationCompletePage() {
  const router = useRouter();
  const [medications, setMedications] = useState<SavedMedication[]>([]);

  useEffect(() => {
    void getSavedMedicationsByIds(getLastSavedMedicationIds()).then(setMedications);
  }, []);

  return (
    <MobileShell className="flow-screen complete-screen">
      <FlowHeader fallbackHref="/" />
      <section className="flow-content complete-content">
        <h1>복용중인 약을 등록했어요!</h1>
        <p>복용중인 약의 용량은 언제든 수정가능해요</p>
        <div className="confirm-card-list">
          {medications.map((medication) => (
            <MedicationSummaryCard compact key={medication.id} medication={medication} />
          ))}
        </div>
      </section>
      <BottomActions>
        <PrimaryButton type="button" onClick={() => router.push("/")}>확인</PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
