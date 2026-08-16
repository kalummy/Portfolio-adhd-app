"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { getDraft, updateDraft } from "@/lib/registration-session";

export default function ManualMedicationNamePage() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    const draft = getDraft();
    setName(draft.manualName);
    updateDraft({ method: "manual" });
  }, []);

  return (
    <MobileShell className="flow-screen">
      <FlowHeader />
      <section className="flow-content input-content">
        <h1>복용중인 약을 입력해주세요</h1>
        <input
          id="manual-name"
          className="text-field"
          placeholder="예) 콘서타"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            updateDraft({ method: "manual", manualName: event.target.value, medications: [] });
          }}
          autoFocus
        />
      </section>
      <BottomActions>
        <PrimaryButton
          type="button"
          disabled={!name.trim()}
          onClick={() => router.push("/medications/new/manual/strength")}
        >
          다음
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
