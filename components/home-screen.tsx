"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { HomeDatePickerSheet } from "@/components/home-date-picker-sheet";
import { getAuthState } from "@/lib/auth/client";
import {
  startMedicationAddAttempt,
  startMoodAttempt,
  startVisitAddAttempt,
  trackMedicationTakenOnce,
} from "@/lib/analytics/events";
import { getDataRepositories, retryGuestDatasetSync } from "@/lib/repositories";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { getWeekProgress } from "@/lib/home-week-progress";
import {
  KST_TIME_ZONE,
  addDaysToDateKey,
  dateKeyDayDifference,
  formatDateKey,
  getDateKeyDay,
  getKstDateKey,
  getWeekDateKeys,
  moveMonthDateKey,
  parseDateKey,
  startOfMonthDateKey,
} from "@/lib/kst-date";
import {
  MEDICATION_FALLBACK_IMAGE,
  medicationLabel,
  medicationScheduleLabel,
} from "@/lib/medication-utils";
import { getMoodDiarySummary, getMoodPresentation } from "@/lib/mood-summary";
import { formatVisitDday, fromDateKey as fromVisitDateKey } from "@/lib/visit-date";
import type {
  HomeDataSet,
  MedicationIntakeRecord,
  MoodRecord,
  SavedMedication,
  VisitSchedule,
} from "@/lib/types";
import { resetDraft } from "@/lib/registration-session";
import { MobileShell } from "./mobile-shell";
import { SplashScreen } from "./splash-screen";
import { Toast } from "./toast";

const SPLASH_SESSION_KEY = "addi:splash:shown:v1";
const SPLASH_MINIMUM_MS = 800;

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DEFAULT_DIARY_SUMMARY = "오늘은 감정과 신체 컨디션이 평소와 비슷했어요.";

function formatRecordTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: KST_TIME_ZONE,
  }).format(date);
}

function formatMedicationRecordTime(iso: string) {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: KST_TIME_ZONE,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((item) => item.type === type)?.value ?? ""
  );
  const rawDayPeriod = part("dayPeriod");
  const dayPeriod = /^am$/i.test(rawDayPeriod)
    ? "오전"
    : /^pm$/i.test(rawDayPeriod)
      ? "오후"
      : rawDayPeriod;
  return `${dayPeriod} ${part("hour")}:${part("minute")}`.trim();
}

function ChevronRight() {
  return (
    <span className="chevron-icon" aria-hidden="true">
      <Image src="/icons/chevron-right.svg" alt="" width={12} height={6} />
    </span>
  );
}

type HomeScreenProps = {
  previewData?: HomeDataSet;
  referenceDateKey?: string;
  initialDateKey?: string;
  minimumDateKey?: string;
  maximumDateKey?: string;
  initialToast?: string;
  initialToastQueryKey?: "medicationToast" | "moodToast" | "visitToast";
  enableLaunchSplash?: boolean;
};

export function HomeScreen({
  previewData,
  referenceDateKey,
  initialDateKey,
  minimumDateKey,
  maximumDateKey,
  initialToast,
  initialToastQueryKey,
  enableLaunchSplash = false,
}: HomeScreenProps = {}) {
  const [todayDateKey, setTodayDateKey] = useState(() => getKstDateKey());
  const resolvedReferenceDateKey = useMemo(
    () => referenceDateKey ?? todayDateKey,
    [referenceDateKey, todayDateKey],
  );
  const referenceDate = useMemo(
    () => fromVisitDateKey(resolvedReferenceDateKey),
    [resolvedReferenceDateKey],
  );
  const [selectedDateKey, setSelectedDateKey] = useState(
    initialDateKey ?? resolvedReferenceDateKey,
  );
  const [pendingDateKey, setPendingDateKey] = useState(selectedDateKey);
  const [visibleMonthKey, setVisibleMonthKey] = useState(
    startOfMonthDateKey(selectedDateKey),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const monthSelectRef = useRef<HTMLButtonElement>(null);
  const [medications, setMedications] = useState<SavedMedication[]>(previewData?.medications ?? []);
  const [intakeRecords, setIntakeRecords] = useState<MedicationIntakeRecord[]>(
    previewData?.intakeRecords ?? [],
  );
  const [moodRecords, setMoodRecords] = useState<MoodRecord[]>(previewData?.moodRecords ?? []);
  const [visitSchedule, setVisitSchedule] = useState<VisitSchedule | null>(
    previewData?.visitSchedule ?? null,
  );
  const [loading, setLoading] = useState(!previewData);
  const [toast, setToast] = useState(initialToast ?? "");
  const [syncError, setSyncError] = useState("");
  const [syncRetrying, setSyncRetrying] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [launchSplashRequired, setLaunchSplashRequired] = useState(enableLaunchSplash);
  const [splashMinimumElapsed, setSplashMinimumElapsed] = useState(!enableLaunchSplash);
  const [failedMedicationImages, setFailedMedicationImages] = useState<Set<string>>(
    () => new Set(),
  );

  const selectedRelation = dateKeyDayDifference(selectedDateKey, todayDateKey);
  const selectedDateParts = parseDateKey(selectedDateKey)!;

  useLayoutEffect(() => {
    if (!enableLaunchSplash) return;

    try {
      if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "1") {
        document.documentElement.dataset.addiSplash = "skip";
        setLaunchSplashRequired(false);
        setSplashMinimumElapsed(true);
        return;
      }
    } catch {
      // If sessionStorage is unavailable, showing the launch screen remains the safe default.
    }

    document.documentElement.removeAttribute("data-addi-splash");
  }, [enableLaunchSplash]);

  useEffect(() => {
    if (!enableLaunchSplash || !launchSplashRequired) return;

    const timer = window.setTimeout(() => {
      setSplashMinimumElapsed(true);
    }, SPLASH_MINIMUM_MS);

    return () => window.clearTimeout(timer);
  }, [enableLaunchSplash, launchSplashRequired]);

  const load = useCallback(async () => {
    if (previewData) {
      setMedications(previewData.medications);
      setIntakeRecords(previewData.intakeRecords);
      setMoodRecords(previewData.moodRecords);
      setVisitSchedule(previewData.visitSchedule ?? null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const repositories = await getDataRepositories();
      setSyncError(repositories.guestDatasetSync.status === "failed"
        ? "저장한 정보를 불러오지 못했어요. 다시 시도해 주세요."
        : "");
      const [authenticated, savedMedications, savedIntakes, savedMoods, savedVisit] = await Promise.all([
        getAuthState()
          .then((state) => state.isAuthenticated)
          .catch(() => false),
        repositories.medications.listActive(),
        repositories.medicationIntakes.listAll(),
        repositories.moods.listAll(),
        repositories.visitSchedules.getUpcoming(),
      ]);
      setIsAuthenticated(authenticated);
      setMedications(savedMedications);
      void enrichOfficialMedications(savedMedications).then((enrichedMedications) => {
        const enrichedById = new Map(
          enrichedMedications.map((medication) => [medication.id, medication]),
        );
        setMedications((current) => current.map(
          (medication) => enrichedById.get(medication.id) ?? medication,
        ));
      });
      setIntakeRecords(savedIntakes);
      setMoodRecords(savedMoods);
      setVisitSchedule(savedVisit);
    } catch {
      setSyncError("저장한 정보를 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [previewData]);

  const handleSyncRetry = useCallback(async () => {
    if (syncRetrying) return;
    setSyncRetrying(true);
    try {
      await retryGuestDatasetSync();
      await load();
    } catch {
      setSyncError("저장한 정보를 불러오지 못했어요. 다시 시도해 주세요.");
    } finally {
      setSyncRetrying(false);
    }
  }, [load, syncRetrying]);

  useEffect(() => {
    void load();
    if (previewData) return;
    window.addEventListener("pageshow", load);
    window.addEventListener("focus", load);
    return () => {
      window.removeEventListener("pageshow", load);
      window.removeEventListener("focus", load);
    };
  }, [load, previewData]);

  useEffect(() => {
    if (
      !enableLaunchSplash
      || !launchSplashRequired
      || !splashMinimumElapsed
      || loading
    ) return;

    try {
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      // The current launch still completes even when storage is unavailable.
    }
    setLaunchSplashRequired(false);
  }, [enableLaunchSplash, launchSplashRequired, loading, splashMinimumElapsed]);

  useEffect(() => {
    if (!initialToast || !initialToastQueryKey) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(initialToastQueryKey)) return;
    url.searchParams.delete(initialToastQueryKey);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [initialToast, initialToastQueryKey]);

  const selectedIntakeByMedication = useMemo(() => {
    return new Map(
      intakeRecords
        .filter((record) => record.date === selectedDateKey && record.taken)
        .map((record) => [record.medicationId, record]),
    );
  }, [intakeRecords, selectedDateKey]);

  const moodRecord = useMemo(
    () => moodRecords.find((record) => record.date === selectedDateKey) ?? null,
    [moodRecords, selectedDateKey],
  );

  const week = useMemo(() => {
    return getWeekDateKeys(selectedDateKey).map((dateKey) => {
      const date = parseDateKey(dateKey)!;
      const progress = getWeekProgress(dateKey, intakeRecords, moodRecords);

      return {
        day: DAY_LABELS[getDateKeyDay(dateKey)],
        date: date.day,
        dateKey,
        isToday: dateKey === todayDateKey,
        isSelected: dateKey === selectedDateKey,
        progress,
      };
    });
  }, [intakeRecords, moodRecords, selectedDateKey, todayDateKey]);

  const handleToggleMedication = async (medicationId: string) => {
    const isTaken = selectedIntakeByMedication.has(medicationId);

    if (previewData) {
      setIntakeRecords((currentRecords) => {
        const recordId = `${selectedDateKey}:${medicationId}`;
        if (isTaken) {
          return currentRecords.filter((record) => record.id !== recordId);
        }

        return [
          ...currentRecords,
          {
            id: recordId,
            medicationId,
            date: selectedDateKey,
            taken: true,
            recordedAt: new Date().toISOString(),
          },
        ];
      });
      return;
    }

    const repositories = await getDataRepositories();
    await repositories.medicationIntakes.setTaken(
      medicationId,
      selectedDateKey,
      !isTaken,
    );
    if (!isTaken) {
      await trackMedicationTakenOnce(medicationId, selectedDateKey);
    }
    await load();
  };

  const commitSelectedDate = useCallback((nextDateKey: string) => {
    if (minimumDateKey && nextDateKey < minimumDateKey) return;
    if (maximumDateKey && nextDateKey > maximumDateKey) return;
    setSelectedDateKey(nextDateKey);
    if (previewData) return;
    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDateKey);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [maximumDateKey, minimumDateKey, previewData]);

  const handleMoveDate = (amount: number) => {
    commitSelectedDate(addDaysToDateKey(selectedDateKey, amount));
  };

  const handleOpenCalendar = () => {
    setPendingDateKey(selectedDateKey);
    setVisibleMonthKey(startOfMonthDateKey(selectedDateKey));
    setCalendarOpen(true);
  };

  const handleCloseCalendar = useCallback(() => {
    setCalendarOpen(false);
  }, []);

  const handleConfirmCalendar = () => {
    commitSelectedDate(pendingDateKey);
    setCalendarOpen(false);
  };

  const handleCalendarToday = () => {
    const nextTodayDateKey = getKstDateKey();
    setTodayDateKey(nextTodayDateKey);
    setPendingDateKey(nextTodayDateKey);
    setVisibleMonthKey(startOfMonthDateKey(nextTodayDateKey));
  };

  const moodEmptyTitle =
    selectedRelation === 0
      ? "오늘의 감정은 어떤가요?"
      : selectedRelation < 0
        ? `${formatDateKey(selectedDateKey)} 감정은 어땠나요?`
        : `${formatDateKey(selectedDateKey)} 감정을 기록해주세요`;
  const medicationTitle = selectedRelation === 0 ? "오늘 복용약" : "복용약";
  const showDateEyebrow = selectedRelation !== 0;

  if (enableLaunchSplash && launchSplashRequired) {
    return <SplashScreen />;
  }

  return (
    <MobileShell className="home-screen">
      <header className="home-header">
        <div className="home-header-brand">
          <Image src="/brand/addi-wordmark.svg" alt="ADDI" width={70} height={28} priority />
        </div>
        <Link href="/auth/login" className="home-account-link">
          {isAuthenticated ? "계정" : "로그인"}
        </Link>
      </header>

      <div className="home-month-select-row">
        <button
          ref={monthSelectRef}
          type="button"
          className="home-month-select"
          aria-haspopup="dialog"
          aria-expanded={calendarOpen}
          onClick={handleOpenCalendar}
        >
          <span>{selectedDateParts.month}월</span>
          <span className="home-month-select-icon" aria-hidden="true">
            <Image src="/icons/chevron-down.svg" alt="" width={10} height={5} />
          </span>
        </button>
      </div>

      <section className="week-strip" aria-label="이번 주">
        {week.map(({ day, date, dateKey, isToday, isSelected, progress }) => (
          <div key={dateKey} className={`${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}>
            <span>{day}</span>
            <strong className={`week-date ${progress}`}>{date}</strong>
          </div>
        ))}
      </section>

      <Link
        className="appointment-row"
        href={visitSchedule ? "/visits" : "/visits/new"}
        aria-label={visitSchedule ? "내원일정 확인하기" : "다음 내원일 추가하기"}
        onClick={() => {
          if (!visitSchedule) startVisitAddAttempt();
        }}
      >
        <span className="clinic-icon" aria-hidden="true">
          <Image className="appointment-base" src="/icons/appointment-base.svg" alt="" width={20} height={20} />
          <Image className="appointment-top" src="/icons/appointment-top.svg" alt="" width={8} height={10} />
        </span>
        <strong>{visitSchedule ? "다음 내원일" : "다음 내원일을 선택해주세요"}</strong>
        {!visitSchedule ? (
          <ChevronRight />
        ) : (
          <span className="appointment-countdown">
            {formatVisitDday(visitSchedule.visitDate, referenceDate) ? (
              <strong>{formatVisitDday(visitSchedule.visitDate, referenceDate)}</strong>
            ) : null}
            <ChevronRight />
          </span>
        )}
      </Link>

      {syncError ? (
        <div className="visit-error home-sync-error" role="alert">
          <span>{syncError}</span>
          <button type="button" disabled={syncRetrying} onClick={() => void handleSyncRetry()}>
            {syncRetrying ? "불러오는 중..." : "다시 시도"}
          </button>
        </div>
      ) : null}

      <section className="home-content">
        <div className="date-heading">
          <button type="button" aria-label="이전 날" onClick={() => handleMoveDate(-1)}>
            <span className="date-chevron date-chevron-left" aria-hidden="true">
              <Image src="/icons/date-chevron-left.svg" alt="" width={12} height={6} />
            </span>
          </button>
          <strong>{selectedRelation === 0 ? "오늘" : formatDateKey(selectedDateKey)}</strong>
          <button type="button" aria-label="다음 날" onClick={() => handleMoveDate(1)}>
            <span className="date-chevron date-chevron-right" aria-hidden="true">
              <Image src="/icons/date-chevron-right.svg" alt="" width={12} height={6} />
            </span>
          </button>
        </div>

        <section className="home-section">
          {loading ? (
            <div className="home-card loading-card" aria-label="복용약 불러오는 중" />
          ) : medications.length === 0 ? (
            <div className="home-card empty-medication-card">
              <div className="home-card-copy">
                <strong>복용중인 약을 등록해주세요</strong>
                <p>약을 등록하면<br />오늘의 복용 여부를 간단히 기록할 수 있어요.</p>
              </div>
              <Link
                href="/medications/new/search"
                className="inline-add-button"
                onClick={() => {
                  resetDraft();
                  startMedicationAddAttempt("home");
                }}
              >
                약 등록하기
              </Link>
            </div>
          ) : (
            <div className="home-card populated-medication-card">
              <div className={`home-card-heading ${showDateEyebrow ? "with-date" : ""}`}>
                {showDateEyebrow && <span className="card-date-eyebrow">{formatDateKey(selectedDateKey)}</span>}
                <Link href="/medications" className="home-card-title" aria-label="복용약 목록 열기">
                  <strong>{medicationTitle}</strong>
                  <ChevronRight />
                </Link>
              </div>
              <div className="saved-medication-list">
                {medications.map((medication) => {
                  const intake = selectedIntakeByMedication.get(medication.id);
                  const isTaken = Boolean(intake);
                  const productImage = medication.productImage?.trim();
                  const hasProductImage = Boolean(productImage && medication.imageType !== "fallback");
                  const imageKey = `${medication.id}:${productImage ?? medication.imagePath}`;
                  const imageFailed = failedMedicationImages.has(imageKey);
                  const isFallbackImage = imageFailed || !hasProductImage;
                  const displayedImage = imageFailed || !hasProductImage
                    ? medication.fallbackImage ?? medication.imagePath ?? MEDICATION_FALLBACK_IMAGE
                    : productImage!;
                  return (
                    <article className="home-medication-item" key={medication.id}>
                      <button
                        type="button"
                        className="medication-check"
                        aria-label={`${medicationLabel(medication)} ${isTaken ? "복용 완료 취소" : "복용 완료 기록"}`}
                        aria-pressed={isTaken}
                        onClick={() => void handleToggleMedication(medication.id)}
                      >
                        <Image
                          src={isTaken ? "/icons/check-circle.svg" : "/icons/check-circle-unrecorded.svg"}
                          alt=""
                          width={20}
                          height={20}
                        />
                      </button>
                      <div className={`home-medication-image ${isFallbackImage ? "fallback" : ""}`}>
                        <Image
                          src={displayedImage}
                          alt=""
                          fill
                          sizes="64px"
                          unoptimized={isFallbackImage}
                          onError={() => setFailedMedicationImages((current) => {
                            if (current.has(imageKey)) return current;
                            const next = new Set(current);
                            next.add(imageKey);
                            return next;
                          })}
                        />
                      </div>
                      <div className="home-medication-copy">
                        <strong>{medicationLabel(medication)}</strong>
                        <div className="home-medication-schedule">
                          <div className="home-medication-time">
                            <span>{medicationScheduleLabel(medication.schedule)}</span>
                            <i aria-hidden="true" />
                            <span>1정</span>
                          </div>
                          <span className={`home-medication-status ${isTaken ? "complete" : ""}`}>
                            {intake
                              ? `복용 완료 (${formatMedicationRecordTime(intake.recordedAt)})`
                              : "아직 복용하지 않았어요"}
                          </span>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="home-section">
          {moodRecord ? (
            <div className="home-card recorded-mood-card">
              <div className={`home-card-heading ${showDateEyebrow ? "with-date" : ""}`}>
                {showDateEyebrow && <span className="card-date-eyebrow">{formatDateKey(selectedDateKey)}</span>}
                <Link href="/moods" className="home-card-title mood-history-link">
                  <strong>{selectedRelation === 0 ? "오늘의 감정" : "감정 기록"}</strong>
                  <ChevronRight />
                </Link>
              </div>
              <div className="recorded-mood-item">
                <Image
                  src={getMoodPresentation(moodRecord.mood).imagePath}
                  alt=""
                  width={64}
                  height={64}
                />
                <strong>{moodRecord.moodLabel}</strong>
                <span>{formatRecordTime(moodRecord.recordedAt)} 기록</span>
              </div>
              <div className="mood-diary-card">
                <div className="mood-diary-title">
                  <Image src="/icons/mood-diary.svg" alt="" width={20} height={20} />
                  <strong>{selectedRelation === 0 ? "오늘의 일기" : "감정 일기"}</strong>
                </div>
                <p>{moodRecord.diaryEntries?.length
                  ? getMoodDiarySummary(moodRecord.diaryEntries)
                  : DEFAULT_DIARY_SUMMARY}</p>
              </div>
            </div>
          ) : (
            <div className={`home-card mood-card date-aware-mood-card ${showDateEyebrow ? "with-date" : ""}`}>
              <div className="home-card-copy">
                {showDateEyebrow && <span className="card-date-eyebrow">{formatDateKey(selectedDateKey)}</span>}
                <strong>{moodEmptyTitle}</strong>
                <p>아직 기록하지 않았어요.</p>
              </div>
              <Link
                href={`/moods/new?date=${selectedDateKey}`}
                className="mood-record-link"
                onClick={() => startMoodAttempt("home")}
              >
                감정 기록하기
              </Link>
            </div>
          )}
        </section>
      </section>

      <footer className="home-footer">
        <div className="footer-links">
          <Link href="/terms">서비스이용약관</Link>
          <i />
          <Link href="/privacy">개인정보처리방침</Link>
        </div>
        <Image src="/brand/addi-footer.svg" alt="아디" width={64} height={24} />
        <p>Copyright ⓒ Kalummy ALL RIGHTS RESERVED.</p>
      </footer>

      {toast ? (
        <Toast
          message={toast}
          onDismiss={() => setToast("")}
          showIcon
        />
      ) : null}

      {calendarOpen ? (
        <HomeDatePickerSheet
          visibleMonthKey={visibleMonthKey}
          pendingDateKey={pendingDateKey}
          todayKey={todayDateKey}
          intakeRecords={intakeRecords}
          moodRecords={moodRecords}
          onSelect={setPendingDateKey}
          onMoveMonth={(amount) => setVisibleMonthKey((current) => moveMonthDateKey(current, amount))}
          onToday={handleCalendarToday}
          onConfirm={handleConfirmCalendar}
          onClose={handleCloseCalendar}
        />
      ) : null}
    </MobileShell>
  );
}
