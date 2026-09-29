"use client";

import Image from "next/image";
import { createClientId } from "@/lib/client-id";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { resolveMedicationEditorInitialTime } from "@/lib/medication-editor-initial-time";
import {
  digitsOnly,
  medicationTimeInputError,
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
  window.requestAnimationFrame(() => {
    const viewport = window.visualViewport;
    const viewportBottom = viewport
      ? viewport.offsetTop + viewport.height
      : window.innerHeight;
    const fields = input.closest(".medication-time-fields") ?? input;
    const overlap = fields.getBoundingClientRect().bottom + 48 - viewportBottom;
    if (overlap > 0) window.scrollBy({ top: overlap, behavior: "instant" });
  });
}

function isSameRecordedAtInstant(left?: string, right?: string) {
  if (!left || !right) return false;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
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
  const [error, setError] = useState("");
  const [timeInputError, setTimeInputError] = useState("");
  const [schedule, setSchedule] = useState<MedicationSchedule>("daily");
  const savingRef = useRef(false);
  const originalTime = useRef<MedicationTimeFields | null>(null);
  const replaceHourOnNextInput = useRef(false);
  const replaceMinuteOnNextInput = useRef(false);

  useEffect(() => {
    const adjust = () => {
      const input = document.activeElement;
      if (input instanceof HTMLInputElement && input.closest(".medication-time-picker")) keepInputVisible(input);
    };
    window.visualViewport?.addEventListener("resize", adjust);
    window.addEventListener("resize", adjust);
    // The native keyboard event can follow the viewport resize and hide the fixed CTA.
    const keyboardObserver = new MutationObserver(adjust);
    keyboardObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-keyboard"],
    });
    return () => {
      keyboardObserver.disconnect();
      window.visualViewport?.removeEventListener("resize", adjust);
      window.removeEventListener("resize", adjust);
    };
  }, []);

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
        setIntake(matchingIntakes[0] ?? null);
        setSchedule(savedMedication.schedule);
        originalTime.current = initialTime;
      })
      .catch(() => {
        if (!cancelled) setError("복용 정보를 불러오지 못했어요. 다시 시도해주세요.");
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
  const canComplete = Boolean(intake) && recordedAt !== undefined && !timeInputError && !saving;

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
    const invalid = medicationTimeInputError("hour", nextValue);
    if (invalid) {
      setTimeInputError(invalid);
      return;
    }
    setTimeInputError("");
    const normalized = normalizeHourInput(nextValue, period);
    setPeriod(normalized.period);
    setHour(normalized.hour);
  }

  function changeMinute(value: string, insertedText: string | null) {
    const nextValue = replaceMinuteOnNextInput.current
      ? valueAfterFirstFocusedInput(value, minute, insertedText)
      : value;
    replaceMinuteOnNextInput.current = false;
    const invalid = medicationTimeInputError("minute", nextValue);
    if (invalid) {
      setTimeInputError(invalid);
      return;
    }
    setTimeInputError("");
    setMinute(digitsOnly(nextValue));
  }

  async function complete() {
    if (savingRef.current) return;
    if (!medication || !intake || !targetDateKey || recordedAt === undefined || timeInputError || saving) return;

    const timeChanged = originalTime.current?.period !== period
      || originalTime.current?.hour !== hour
      || originalTime.current?.minute !== minute;
    const scheduleChanged = medication.schedule !== schedule;
    if (!timeChanged && !scheduleChanged) {
      router.replace(homeHref);
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const repositories = await getDataRepositories();
      if (scheduleChanged) {
        // Figma 273:8706: schedule choice is independent of the recorded intake time.
        const saved = await repositories.medications.updateSchedule(medication.id, { schedule });
        const [persisted] = await repositories.medications.getByIds([medication.id]);
        if ([saved, persisted].some(value => !value || value.id !== medication.id || value.schedule !== schedule)) {
          throw new Error("medication_schedule_unconfirmed");
        }
      }
      if (timeChanged) {
        const repository = repositories.medicationIntakes;
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
          || !isSameRecordedAtInstant(savedRecord.recordedAt, recordedAt)
          || persistedRecord?.id !== intake.id
          || !isSameRecordedAtInstant(persistedRecord?.recordedAt, recordedAt)
        ) throw new Error("복용 완료 시간 저장 결과를 확인하지 못했어요.");
      }
      const destination = new URL(homeHref, window.location.origin);
      destination.searchParams.set("medicationToast", timeChanged ? "time-updated" : "schedule-updated");
      destination.searchParams.set("toastId", createClientId());
      router.replace(`${destination.pathname}${destination.search}${destination.hash}`);
    } catch {
      setError("저장하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (!medication || !intake) {
    return (
      <MobileShell className="flow-screen medication-schedule-edit-screen">
        <FlowHeader title="복용 정보" fallbackHref={returnHref} />
        {error ? <p className="save-error" role="alert">{error}</p> : null}
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
                disabled={saving}
                onClick={() => setSchedule(option.value)}
                key={option.value}
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
                  aria-invalid={Boolean(timeInputError)}
                  aria-describedby={timeInputError ? "medication-time-input-error" : undefined}
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
                  aria-invalid={Boolean(timeInputError)}
                  aria-describedby={timeInputError ? "medication-time-input-error" : undefined}
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
          {timeInputError ? <p id="medication-time-input-error" className="save-error" role="alert">{timeInputError}</p> : null}
        </section>
      </section>

      <BottomActions>
        {error ? <p className="save-error" role="alert">{error}</p> : null}
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
