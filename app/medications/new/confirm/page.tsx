"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { getDraft } from "@/lib/registration-session";
import type { MedicationDraft } from "@/lib/types";

export default function MedicationConfirmPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<MedicationDraft | null>(null);

  useEffect(() => setDraft(getDraft()), []);

  if (!draft) return <MobileShell className="flow-screen">{null}</MobileShell>;

  return (
    <MobileShell className="flow-screen">
      <FlowHeader />
      <section className="flow-content confirm-content">
        <h1>복용중인 약이 맞는지<br />이름과 용량을 확인해주세요</h1>
        <div className="confirm-card-list">
          {draft.medications.map((medication) => (
            <MedicationSummaryCard key={`${medication.name}-${medication.strengthValue}`} medication={medication} />
          ))}
        </div>
      </section>
      <BottomActions>
        <div className="split-actions">
          <PrimaryButton
            type="button"
            variant="soft"
            onClick={() =>
              router.push(draft.method === "manual" ? "/medications/new/manual/name" : "/medications/new/search")
            }
          >
            아니에요
          </PrimaryButton>
          <PrimaryButton type="button" onClick={() => router.push("/medications/new/schedule")}>
            맞아요
          </PrimaryButton>
        </div>
      </BottomActions>
    </MobileShell>
  );
}
