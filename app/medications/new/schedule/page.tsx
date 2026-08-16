"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { getDraft, updateDraft } from "@/lib/registration-session";
import type { MedicationSchedule } from "@/lib/types";

const schedules: Array<{ value: MedicationSchedule; label: string }> = [
  { value: "daily", label: "매일" },
  { value: "as-needed", label: "필요시" },
  { value: "bedtime", label: "자기 전" },
];

export default function MedicationSchedulePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<MedicationSchedule | undefined>();

  useEffect(() => setSelected(getDraft().schedule), []);

  return (
    <MobileShell className="flow-screen">
      <FlowHeader />
      <section className="flow-content schedule-content">
        <h1>복용 일정을 선택해주세요</h1>
        <div className="schedule-options" role="radiogroup" aria-label="복용 일정">
          {schedules.map((schedule) => (
            <button
              type="button"
              role="radio"
              aria-checked={selected === schedule.value}
              className={`schedule-option ${selected === schedule.value ? "selected" : ""}`}
              key={schedule.value}
              onClick={() => {
                setSelected(schedule.value);
                updateDraft({ schedule: schedule.value });
              }}
            >
              <span className="radio-mark" aria-hidden="true">
                {selected === schedule.value ? (
                  <Image src="/icons/radio-selected.svg" alt="" width={20} height={20} />
                ) : (
                  <>
                    <Image className="radio-default-outer" src="/icons/radio-default-outer.svg" alt="" width={20} height={20} />
                    <Image className="radio-default-inner" src="/icons/radio-default-inner.svg" alt="" width={8} height={8} />
                  </>
                )}
              </span>
              <strong>{schedule.label}</strong>
            </button>
          ))}
        </div>
      </section>
      <BottomActions>
        <PrimaryButton
          type="button"
          disabled={!selected}
          onClick={() => router.push("/medications/new/notice")}
        >
          다음
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
