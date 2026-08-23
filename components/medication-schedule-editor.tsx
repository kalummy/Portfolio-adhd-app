"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { resolveMedicationEditorInitialTime } from "@/lib/medication-editor-initial-time";
import {
  digitsOnly,
  normalizeHourInput,
  toRecordedAtIso,
  type MedicationTimeFields,
  type MedicationTimePeriod,
} from "@/lib/medication-time";
import { getDataRepositories } from "@/lib/repositories";
import type { MedicationIntakeRecord, MedicationSchedule, SavedMedication } from "@/lib/types";

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
  const [intake, setIntake] = useState<MedicationIntakeRecord | null>(null);
  const [period, setPeriod] = useState<MedicationTimePeriod>("am");
  const [hour, setHour] = useState("");
  const [minute, setMinute] = useState("");
  const [saving, setSaving] = useState(false);
  const originalTime = useRef<MedicationTimeFields | null>(null);
  const replaceHourOnNextInput = useRef(false);
  const replaceMinuteOnNextInput = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!targetDateKey) {
      router.replace(returnHref);
      return () => {
        cancelled = true;
      };
    }
    void getDataRepositories()
      .then(async (repositories) => {
        const [[savedMedication], intakeRecords] = await Promise.all([
          repositories.medications.getByIds([medicationId]),
          repositories.medicationIntakes.listByDate(targetDateKey),
        ]);
        if (!savedMedication) {
          router.replace(returnHref);
          return;
        }
        const initialTime = resolveMedicationEditorInitialTime(
          medicationId,
          intakeRecords,
          targetDateKey,
        );
        const matchingIntakes = intakeRecords.filter((record) => (
          record.medicationId === medicationId
          && record.date === targetDateKey
          && record.taken === true
        ));
        if (!initialTime || matchingIntakes.length !== 1) {
          router.replace(returnHref);
          return;
        }
        const [enrichedMedication] = await enrichOfficialMedications([savedMedication]);
        if (cancelled) return;

        setPeriod(initialTime.period);
        setHour(initialTime.hour);
        setMinute(initialTime.minute);
        setMedication(enrichedMedication ?? savedMedication);
        setIntake(matchingIntakes[0]);
        originalTime.current = initialTime;
      })
      .catch(() => {
        // Figma does not define a loading failure state for this screen.
      });
    return () => {
      cancelled = true;
    };
  }, [medicationId, returnHref, router, targetDateKey]);

  const recordedAt = useMemo(
    () => targetDateKey
      ? toRecordedAtIso(targetDateKey, { period, hour, minute })
      : undefined,
    [hour, minute, period, targetDateKey],
  );
  const canComplete = Boolean(intake) && recordedAt !== undefined && !saving;

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
    if (!medication || !intake || !targetDateKey || recordedAt === undefined || saving) return;

    const timeChanged = originalTime.current?.period !== period
      || originalTime.current?.hour !== hour
      || originalTime.current?.minute !== minute;
    if (!timeChanged) {
      router.replace(homeHref);
      return;
    }

    setSaving(true);
    try {
      const { medicationIntakes: repository } = await getDataRepositories();
      const savedRecord = await repository.updateRecordedAt(
        medication.id,
        targetDateKey,
        recordedAt,
      );
      const persistedMatches = (await repository.listByDate(targetDateKey)).filter((record) => (
        record.medicationId === medication.id
        && record.date === targetDateKey
        && record.taken === true
      ));
      const persistedRecord = persistedMatches[0];
      if (
        persistedMatches.length !== 1
        || savedRecord.id !== intake.id
        || savedRecord.recordedAt !== recordedAt
        || persistedRecord?.id !== intake.id
        || persistedRecord.recordedAt !== recordedAt
      ) throw new Error("복용 완료 시간 저장 결과를 확인하지 못했어요.");
      router.replace(homeHref);
    } catch {
      // Figma does not define a save failure state for this screen.
    } finally {
      setSaving(false);
    }
  }

  if (!medication || !intake) {
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
                aria-checked={medication.schedule === option.value}
                className={`schedule-option ${medication.schedule === option.value ? "selected" : ""}`}
                disabled
                key={option.value}
              >
                <span className="radio-mark" aria-hidden="true">
                  {medication.schedule === option.value ? (
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
