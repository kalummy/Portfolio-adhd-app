"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { trackMedicationScheduleUpdated } from "@/lib/analytics/events";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { resolveMedicationEditorInitialTime } from "@/lib/medication-editor-initial-time";
import {
  digitsOnly,
  normalizeHourInput,
  toScheduledTime,
  type MedicationTimePeriod,
} from "@/lib/medication-time";
import { getDataRepositories } from "@/lib/repositories";
import type { MedicationSchedulePatch } from "@/lib/repositories/medications/types";
import type { MedicationSchedule, SavedMedication } from "@/lib/types";

const schedules: Array<{ value: MedicationSchedule; label: string }> = [
  { value: "daily", label: "매일" },
  { value: "as-needed", label: "필요시" },
  { value: "bedtime", label: "자기 전" },
];

function keepInputVisible(input: HTMLInputElement) {
  window.setTimeout(() => {
    const viewport = window.visualViewport;
    const viewportBottom = viewport
      ? viewport.offsetTop + viewport.height
      : window.innerHeight;
    const inputBottom = input.getBoundingClientRect().bottom;
    const overlap = inputBottom + 48 - viewportBottom;
    if (overlap > 0) window.scrollBy({ top: overlap, behavior: "smooth" });
  }, 250);
}

export function MedicationScheduleEditor({
  medicationId,
  targetDateKey,
  returnHref = "/medications",
  homeHref = "/",
}: {
  medicationId: string;
  targetDateKey?: string;
  returnHref?: string;
  homeHref?: string;
}) {
  const router = useRouter();
  const [medication, setMedication] = useState<SavedMedication | null>(null);
  const [schedule, setSchedule] = useState<MedicationSchedule | null>(null);
  const [period, setPeriod] = useState<MedicationTimePeriod>("am");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [saving, setSaving] = useState(false);
  const originalSchedule = useRef<MedicationSchedule | null>(null);
  const originalTime = useRef<string | null>(null);
  const replaceHourOnNextInput = useRef(false);
  const replaceMinuteOnNextInput = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getDataRepositories()
      .then(async (repositories) => {
        const [[savedMedication], intakeRecords] = await Promise.all([
          repositories.medications.getByIds([medicationId]),
          repositories.medicationIntakes.listAll(),
        ]);
        if (!savedMedication) {
          router.replace(returnHref);
          return;
        }
        const [enrichedMedication] = await enrichOfficialMedications([savedMedication]);
        if (cancelled) return;

        const initialTime = resolveMedicationEditorInitialTime(
          savedMedication,
          intakeRecords,
          targetDateKey,
        );
        setPeriod(initialTime?.period ?? "am");
        setHour(initialTime?.hour ?? "");
        setMinute(initialTime?.minute ?? "");
        setSchedule(savedMedication.schedule);
        setMedication(enrichedMedication ?? savedMedication);
        originalSchedule.current = savedMedication.schedule;
        originalTime.current = savedMedication.scheduledTime ?? null;
      })
      .catch(() => {
        // Figma does not define a loading failure state for this screen.
      });
    return () => {
      cancelled = true;
    };
  }, [medicationId, returnHref, router, targetDateKey]);

  const scheduledTime = useMemo(
    () => toScheduledTime({ period, hour, minute }),
    [hour, minute, period],
  );
  const canComplete = Boolean(schedule) && scheduledTime !== undefined && !saving;

  function valueAfterFirstFocusedInput(
    value: string,
    currentValue: string,
    insertedText: string | null,
  ) {
    if (insertedText) return digitsOnly(insertedText);

    const nextValue = digitsOnly(value);
    if (!currentValue) return nextValue;
    if (nextValue.startsWith(currentValue)) {
      return nextValue.slice(currentValue.length);
    }
    if (nextValue.endsWith(currentValue)) {
      return nextValue.slice(0, -currentValue.length);
    }
    return nextValue;
  }

  function changeHour(value: string, insertedText: string | null) {
    const nextValue = replaceHourOnNextInput.current
      ? valueAfterFirstFocusedInput(value, hour, insertedText)
      : value;
    replaceHourOnNextInput.current = false;
    const normalized = normalizeHourInput(nextValue, period);
    setPeriod(normalized.period);
    setHour(normalized.hour);
  }

  function changeMinute(value: string, insertedText: string | null) {
    const nextValue = replaceMinuteOnNextInput.current
      ? valueAfterFirstFocusedInput(value, minute, insertedText)
      : value;
    replaceMinuteOnNextInput.current = false;
    setMinute(digitsOnly(nextValue));
  }

  async function complete() {
    if (!medication || !schedule || scheduledTime === undefined || saving) return;

    const scheduleChanged = schedule !== originalSchedule.current;
    const timeChanged = scheduledTime !== originalTime.current;
    if (!scheduleChanged && !timeChanged) {
      router.replace(homeHref);
      return;
    }

    const patch: MedicationSchedulePatch = {};
    if (scheduleChanged) patch.schedule = schedule;
    if (timeChanged) patch.scheduledTime = scheduledTime;

    setSaving(true);
    try {
      const { medications: repository } = await getDataRepositories();
      await repository.updateSchedule(medication.id, patch);
      const [persistedMedication] = await repository.getByIds([medication.id]);
      const schedulePersisted = !Object.hasOwn(patch, "schedule")
        || persistedMedication?.schedule === patch.schedule;
      const timePersisted = !Object.hasOwn(patch, "scheduledTime")
        || (persistedMedication?.scheduledTime ?? null) === (patch.scheduledTime ?? null);
      if (!persistedMedication || !schedulePersisted || !timePersisted) {
        throw new Error("복용 일정 저장 결과를 확인하지 못했어요.");
      }
      trackMedicationScheduleUpdated({
        changedFields: scheduleChanged
          ? (timeChanged ? "schedule_and_time" : "schedule")
          : "time",
        previousSchedule: originalSchedule.current ?? medication.schedule,
        newSchedule: schedule,
        hadScheduledTimeBefore: originalTime.current !== null,
        hasScheduledTimeAfter: scheduledTime !== null,
      });
      if (scheduleChanged && !timeChanged) {
        const destination = new URL(homeHref, window.location.origin);
        destination.searchParams.set("medicationToast", "schedule-updated");
        router.replace(`${destination.pathname}${destination.search}`);
      } else {
        router.replace(homeHref);
      }
    } catch {
      // Figma does not define a save failure state for this screen.
    } finally {
      setSaving(false);
    }
  }

  if (!medication || !schedule) {
    return (
      <MobileShell className="flow-screen medication-schedule-edit-screen">
        {null}
      </MobileShell>
    );
  }

  return (
    <MobileShell className="flow-screen medication-schedule-edit-screen">
      <FlowHeader title="복용 시간 수정" fallbackHref={returnHref} />
      <section className="medication-schedule-edit-content">
        <MedicationSummaryCard medication={medication} />

        <section className="medication-edit-section medication-edit-schedule-section">
          <h1>복용 일정</h1>
          <div className="medication-edit-schedule-options" role="radiogroup" aria-label="복용 일정">
            {schedules.map((option) => (
              <button
                type="button"
                role="radio"
                aria-checked={schedule === option.value}
                className={`schedule-option ${schedule === option.value ? "selected" : ""}`}
                key={option.value}
                onClick={() => setSchedule(option.value)}
              >
                <span className="radio-mark" aria-hidden="true">
                  {schedule === option.value ? (
                    <Image src="/icons/radio-selected.svg" alt="" width={20} height={20} />
                  ) : (
                    <>
                      <Image
                        className="radio-default-outer"
                        src="/icons/radio-default-outer.svg"
                        alt=""
                        width={20}
                        height={20}
                      />
                      <Image
                        className="radio-default-inner"
                        src="/icons/radio-default-inner.svg"
                        alt=""
                        width={8}
                        height={8}
                      />
                    </>
                  )}
                </span>
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="medication-edit-section medication-edit-time-section">
          <h1>복용 시간</h1>
          <div className="medication-time-fields">
            <div className="medication-period-options">
              {([
                ["am", "오전"],
                ["pm", "오후"],
              ] as const).map(([value, label]) => (
                <button
                  type="button"
                  aria-pressed={period === value}
                  className={period === value ? "selected" : ""}
                  key={value}
                  onClick={() => setPeriod(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="medication-time-picker">
              <label className="medication-time-input">
                <input
                  aria-label="시"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={hour}
                  onChange={(event) => changeHour(
                    event.target.value,
                    (event.nativeEvent as InputEvent).data,
                  )}
                  onFocus={(event) => {
                    replaceHourOnNextInput.current = Boolean(hour);
                    event.currentTarget.select();
                    keepInputVisible(event.currentTarget);
                  }}
                  onBlur={() => {
                    replaceHourOnNextInput.current = false;
                  }}
                />
              </label>
              <span className="medication-time-unit">시</span>
              <label className="medication-time-input">
                <input
                  aria-label="분"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={minute}
                  onChange={(event) => changeMinute(
                    event.target.value,
                    (event.nativeEvent as InputEvent).data,
                  )}
                  onFocus={(event) => {
                    replaceMinuteOnNextInput.current = Boolean(minute);
                    event.currentTarget.select();
                    keepInputVisible(event.currentTarget);
                  }}
                  onBlur={() => {
                    replaceMinuteOnNextInput.current = false;
                  }}
                />
              </label>
              <span className="medication-time-unit">분</span>
            </div>
          </div>
        </section>
      </section>

      <BottomActions>
        <PrimaryButton
          type="button"
          variant="primary"
          disabled={!canComplete}
          aria-busy={saving}
          onClick={() => void complete()}
        >
          완료
        </PrimaryButton>
      </BottomActions>
    </MobileShell>
  );
}
