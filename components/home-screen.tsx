"use client";

import Image from "next/image";
import { CatRewardImage } from "@/components/cat-reward-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { HomeDatePickerSheet } from "@/components/home-date-picker-sheet";
import { getAuthState, type AuthState } from "@/lib/auth/client";
import {
  startMedicationAddAttempt,
  startMoodAttempt,
  startVisitAddAttempt,
  trackHomeDateChangeConfirmed,
  trackHomeDatePickerOpened,
  trackHomeDateSelected,
  trackHomeDateTodayClicked,
  trackMedicationManagementOpened,
  trackMedicationTakenOnce,
  startMedicationTakeAttempt,
  setMedicationTakeBackend,
  trackMedicationTakeResult,
  trackMedicationTakeFailed,
} from "@/lib/analytics/events";
import {
  getDataRepositories,
  runGuestDatasetSyncInBackground,
} from "@/lib/repositories";
import {
  createSingleFlight,
  HomeDataLoadError,
  identifyHomeDataFailure,
  type HomeDataFailureSource,
} from "@/lib/home-load-orchestration";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { resolveMedicationImage } from "@/lib/medication-images";
import { reconcileMedicationIntakeRecord } from "@/lib/medication-intake-state";
import { getHomeMedicationProjection } from "@/lib/home-medication-projection";
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
  medicationLabel,
  medicationScheduleLabel,
} from "@/lib/medication-utils";
import { getMoodDiarySummary, getMoodPresentation } from "@/lib/mood-summary";
import { UNKNOWN_CAT, type CatId } from "@/lib/cats";
import { normalizeClinicPhraseForDisplay } from "@/lib/clinic-phrase";
import { getMoodRecordDisplayCat } from "@/lib/mood-record-cat";
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
import { BottomNavigation } from "./bottom-navigation";
import { SplashScreen } from "./splash-screen";
import { Toast } from "./toast";

const SPLASH_SESSION_KEY = "addi:splash:shown:v1";
const CONSUMED_TOAST_SESSION_PREFIX = "addi:toast:consumed:";
const SPLASH_MINIMUM_MS = 800;

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DEFAULT_DIARY_SUMMARY = "오늘은 감정과 신체 컨디션이 평소와 비슷했어요.";
const WEEK_SWIPE_ACTIVATION_PX = 8;
const WEEK_SWIPE_THRESHOLD_PX = 48;
type HomeSegment = "medication" | "mood";
type WeekPointerGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
};

function accountGreeting(user: AuthState["user"]) {
  const metadata = user?.user_metadata;
  const rawName = metadata?.full_name ?? metadata?.name;
  const name = typeof rawName === "string" ? rawName.trim() : "";
  return name ? `${name}님 반가워요` : "반가워요";
}

function getHomeMoodSummary(record: MoodRecord) {
  return getMoodPresentation(record.mood).label;
}

function getHomeClinicPhrase(record: MoodRecord) {
  return normalizeClinicPhraseForDisplay(record.analysisResult?.clinicPhrase.text ?? "")
    || normalizeClinicPhraseForDisplay(record.clinicPhrase ?? "")
    || normalizeClinicPhraseForDisplay(record.memberSummary ?? "")
    || (record.diaryEntries?.length ? getMoodDiarySummary(record.diaryEntries) : DEFAULT_DIARY_SUMMARY);
}

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
  initialToastId?: string;
  initialToastQueryKey?: "medicationToast" | "moodToast" | "visitToast" | "feedbackToast";
  enableLaunchSplash?: boolean;
};

export function HomeScreen({
  previewData,
  referenceDateKey,
  initialDateKey,
  minimumDateKey,
  maximumDateKey,
  initialToast,
  initialToastId,
  initialToastQueryKey,
  enableLaunchSplash = false,
}: HomeScreenProps = {}) {
  const router = useRouter();
  const { bfcacheId } = router;
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
  const calendarConfirmHandledRef = useRef(false);
  const weekPointerGestureRef = useRef<WeekPointerGesture | null>(null);
  const suppressWeekClickRef = useRef(false);
  const intakeMutationGenerationRef = useRef(0);
  const homeLoadGenerationRef = useRef(0);
  const guestDatasetSyncStartedRef = useRef(false);
  const [medications, setMedications] = useState<SavedMedication[]>(previewData?.medications ?? []);
  const [intakeRecords, setIntakeRecords] = useState<MedicationIntakeRecord[]>(
    previewData?.intakeRecords ?? [],
  );
  const [moodRecords, setMoodRecords] = useState<MoodRecord[]>(previewData?.moodRecords ?? []);
  const [visitSchedule, setVisitSchedule] = useState<VisitSchedule | null>(
    previewData?.visitSchedule ?? null,
  );
  const [loading, setLoading] = useState(!previewData);
  const [toast, setToast] = useState(initialToastId ? "" : initialToast ?? "");
  const activeToastIdRef = useRef<string | null>(null);
  const toastActivityGenerationRef = useRef(0);
  const [syncError, setSyncError] = useState("");
  const [syncRetrying, setSyncRetrying] = useState(false);
  const [homeDataFailureSource, setHomeDataFailureSource] = useState<HomeDataFailureSource | null>(null);
  const [guestDatasetSyncStatus, setGuestDatasetSyncStatus] = useState<
    "idle" | "running" | "succeeded" | "failed"
  >("idle");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [greeting, setGreeting] = useState("로그인이 필요해요");
  const [activeSegment, setActiveSegment] = useState<HomeSegment>("medication");
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

  useLayoutEffect(() => {
    const generation = ++toastActivityGenerationRef.current;
    return () => {
      queueMicrotask(() => {
        if (toastActivityGenerationRef.current !== generation) return;
        activeToastIdRef.current = null;
        setToast("");
      });
    };
  }, []);

  useEffect(() => {
    if (!enableLaunchSplash || !launchSplashRequired) return;

    const timer = window.setTimeout(() => {
      setSplashMinimumElapsed(true);
    }, SPLASH_MINIMUM_MS);

    return () => window.clearTimeout(timer);
  }, [enableLaunchSplash, launchSplashRequired]);

  const performLoad = useCallback(async () => {
    const loadGeneration = ++homeLoadGenerationRef.current;
    const isCurrentLoad = () => loadGeneration === homeLoadGenerationRef.current;
    const intakeMutationGeneration = intakeMutationGenerationRef.current;
    if (previewData) {
      if (!isCurrentLoad()) return;
      setMedications(previewData.medications);
      setIntakeRecords(previewData.intakeRecords);
      setMoodRecords(previewData.moodRecords);
      setVisitSchedule(previewData.visitSchedule ?? null);
      setSyncError("");
      setHomeDataFailureSource(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const repositories = await getDataRepositories();
      const [authState, savedMedications, savedIntakes, savedMoods, savedVisit] = await Promise.all([
        getAuthState().catch(() => ({ isAuthenticated: false, user: null })),
        identifyHomeDataFailure("medications_failed", repositories.medications.listAll()),
        identifyHomeDataFailure("intake_failed", repositories.medicationIntakes.listAll()),
        identifyHomeDataFailure("moods_failed", repositories.moods.listAll()),
        identifyHomeDataFailure("visits_failed", repositories.visitSchedules.getUpcoming()),
      ]);
      if (!isCurrentLoad()) return;
      setSyncError("");
      setHomeDataFailureSource(null);
      setIsAuthenticated(authState.isAuthenticated);
      setGreeting(authState.isAuthenticated ? accountGreeting(authState.user) : "로그인이 필요해요");
      setMedications(savedMedications);
      void enrichOfficialMedications(savedMedications).then((enrichedMedications) => {
        if (!isCurrentLoad()) return;
        const enrichedById = new Map(
          enrichedMedications.map((medication) => [medication.id, medication]),
        );
        setMedications((current) => current.map(
          (medication) => enrichedById.get(medication.id) ?? medication,
        ));
      });
      if (intakeMutationGeneration === intakeMutationGenerationRef.current) {
        setIntakeRecords(savedIntakes);
      }
      setMoodRecords(savedMoods);
      setVisitSchedule(savedVisit);
    } catch (error) {
      if (!isCurrentLoad()) return;
      if (error instanceof HomeDataLoadError) {
        setHomeDataFailureSource(error.source);
        setSyncError("저장한 정보를 불러오지 못했어요. 다시 시도해 주세요.");
      } else {
        setHomeDataFailureSource(null);
        setSyncError("");
      }
    } finally {
      if (isCurrentLoad()) setLoading(false);
    }
  }, [previewData]);

  const load = useMemo(() => createSingleFlight(performLoad), [performLoad]);

  const startGuestDatasetSync = useCallback(async () => {
    if (previewData || guestDatasetSyncStartedRef.current) return;
    guestDatasetSyncStartedRef.current = true;
    setGuestDatasetSyncStatus("running");
    try {
      const result = await runGuestDatasetSyncInBackground();
      setGuestDatasetSyncStatus(result.status === "failed" ? "failed" : "succeeded");
      if (result.status === "merged") await load();
    } catch {
      setGuestDatasetSyncStatus("failed");
    }
  }, [load, previewData]);

  const handleSyncRetry = useCallback(async () => {
    if (syncRetrying) return;
    setSyncRetrying(true);
    try {
      await load();
    } finally {
      setSyncRetrying(false);
    }
  }, [load, syncRetrying]);

  useEffect(() => {
    void load().then(startGuestDatasetSync);
    if (previewData) return;
    window.addEventListener("pageshow", load);
    window.addEventListener("focus", load);
    return () => {
      homeLoadGenerationRef.current += 1;
      window.removeEventListener("pageshow", load);
      window.removeEventListener("focus", load);
    };
  }, [bfcacheId, load, previewData, startGuestDatasetSync]);

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
    if (previewData) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("date")) return;
    url.searchParams.delete("date");
    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [previewData]);

  useEffect(() => {
    if (!initialToastQueryKey) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has(initialToastQueryKey)) return;
    const currentToastId = initialToastId && url.searchParams.get("toastId") === initialToastId
      ? initialToastId
      : null;

    if (currentToastId && initialToast) {
      const consumptionKey = `${CONSUMED_TOAST_SESSION_PREFIX}${currentToastId}`;
      let consumed = false;
      try {
        consumed = window.sessionStorage.getItem(consumptionKey) === "1";
        if (!consumed) window.sessionStorage.setItem(consumptionKey, "1");
      } catch {
        consumed = activeToastIdRef.current === currentToastId;
      }

      if (!consumed) {
        activeToastIdRef.current = currentToastId;
        setToast(initialToast);
      } else if (activeToastIdRef.current !== currentToastId) {
        setToast("");
      }
      url.searchParams.delete("toastId");
    }

    url.searchParams.delete(initialToastQueryKey);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [initialToast, initialToastId, initialToastQueryKey]);

  const selectedIntakeByMedication = useMemo(() => {
    return new Map(
      intakeRecords
        .filter((record) => record.date === selectedDateKey && record.taken)
        .map((record) => [record.medicationId, record]),
    );
  }, [intakeRecords, selectedDateKey]);

  const activeMedicationCount = useMemo(
    () => medications.filter((medication) => medication.active !== false).length,
    [medications],
  );
  const displayedMedications = useMemo(() => getHomeMedicationProjection({
    medications,
    intakeRecords,
    selectedDate: selectedDateKey,
    todayDate: todayDateKey,
  }), [intakeRecords, medications, selectedDateKey, todayDateKey]);

  const moodRecord = useMemo(
    () => moodRecords.find((record) => record.date === selectedDateKey) ?? null,
    [moodRecords, selectedDateKey],
  );
  const moodCat = moodRecord
    ? getMoodRecordDisplayCat(moodRecord.catId)
    : UNKNOWN_CAT;
  const moodCatId = moodCat.id as CatId | typeof UNKNOWN_CAT.id;

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

    const mutationGeneration = ++intakeMutationGenerationRef.current;
    const takeAttempt = !isTaken ? startMedicationTakeAttempt() : null;
    let savedRecord: MedicationIntakeRecord | null;
    try {
      const repositories = await getDataRepositories();
      setMedicationTakeBackend(takeAttempt, repositories);
      savedRecord = await repositories.medicationIntakes.setTaken(
        medicationId,
        selectedDateKey,
        !isTaken,
      );
    } catch (error) {
      trackMedicationTakeFailed(takeAttempt, error);
      throw error; // Preserve the existing rejection/interaction behavior.
    }
    // Diagnostic only: do not gate legacy reconciliation, medication_taken or load.
    trackMedicationTakeResult(takeAttempt, savedRecord, medicationId, selectedDateKey);
    if (mutationGeneration === intakeMutationGenerationRef.current) {
      setIntakeRecords((currentRecords) => reconcileMedicationIntakeRecord(
        currentRecords,
        medicationId,
        selectedDateKey,
        savedRecord,
      ));
    }
    if (!isTaken) {
      await trackMedicationTakenOnce(medicationId, selectedDateKey);
    }
    await load();
  };

  const commitSelectedDate = useCallback((nextDateKey: string) => {
    if (minimumDateKey && nextDateKey < minimumDateKey) return false;
    if (maximumDateKey && nextDateKey > maximumDateKey) return false;
    setSelectedDateKey(nextDateKey);
    if (previewData) return true;
    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDateKey);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    return true;
  }, [maximumDateKey, minimumDateKey, previewData]);

  const handleWeekPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    suppressWeekClickRef.current = false;
    weekPointerGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
    };
  };

  const handleWeekPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = weekPointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.dragging) {
      if (
        Math.abs(deltaX) < WEEK_SWIPE_ACTIVATION_PX
        && Math.abs(deltaY) < WEEK_SWIPE_ACTIVATION_PX
      ) return;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) {
        weekPointerGestureRef.current = null;
        return;
      }
      gesture.dragging = true;
      suppressWeekClickRef.current = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The gesture can still finish inside the Week container without capture.
      }
    }

    event.preventDefault();
  };

  const handleWeekPointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = weekPointerGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    weekPointerGestureRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!gesture.dragging) return;

    const deltaX = event.clientX - gesture.startX;
    if (Math.abs(deltaX) >= WEEK_SWIPE_THRESHOLD_PX) {
      commitSelectedDate(addDaysToDateKey(selectedDateKey, deltaX > 0 ? -7 : 7));
    }
    window.setTimeout(() => {
      suppressWeekClickRef.current = false;
    }, 0);
  };

  const handleWeekPointerCancel = () => {
    weekPointerGestureRef.current = null;
    suppressWeekClickRef.current = false;
  };

  const handleWeekClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressWeekClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressWeekClickRef.current = false;
  };

  const handleOpenCalendar = () => {
    trackHomeDatePickerOpened(selectedDateKey);
    calendarConfirmHandledRef.current = false;
    setPendingDateKey(selectedDateKey);
    setVisibleMonthKey(startOfMonthDateKey(selectedDateKey));
    setCalendarOpen(true);
  };

  const handleCloseCalendar = useCallback(() => {
    setCalendarOpen(false);
  }, []);

  const handleConfirmCalendar = () => {
    if (calendarConfirmHandledRef.current) return;
    calendarConfirmHandledRef.current = true;
    const previousDateKey = selectedDateKey;
    const applied = commitSelectedDate(pendingDateKey);
    if (applied && previousDateKey !== pendingDateKey) {
      trackHomeDateChangeConfirmed(previousDateKey, pendingDateKey);
    }
    setCalendarOpen(false);
  };

  const handleCalendarSelect = (dateKey: string) => {
    trackHomeDateSelected(dateKey);
    setPendingDateKey(dateKey);
  };

  const handleCalendarToday = () => {
    trackHomeDateTodayClicked();
    const nextTodayDateKey = getKstDateKey();
    setTodayDateKey(nextTodayDateKey);
    setPendingDateKey(nextTodayDateKey);
    setVisibleMonthKey(startOfMonthDateKey(nextTodayDateKey));
  };

  const medicationTitle = selectedRelation === 0
    ? "오늘 복용약"
    : `${formatDateKey(selectedDateKey)} 복용약`;
  const moodEmptyTitle = selectedRelation === 0
    ? "오늘의 감정은 어떤가요?"
    : selectedRelation < 0
      ? `${formatDateKey(selectedDateKey)} 감정은 어땠나요?`
      : `${formatDateKey(selectedDateKey)} 감정을 기록해주세요`;
  if (enableLaunchSplash && launchSplashRequired) {
    return <SplashScreen />;
  }

  return (
    <MobileShell
      className="home-screen"
      data-home-data-failure={homeDataFailureSource ?? undefined}
      data-guest-dataset-sync={guestDatasetSyncStatus}
    >
      <header className="home-header">
        <Link
          href="/my"
          className="home-profile-link"
          aria-label="마이홈 열기"
        >
          <Image src="/icons/random-profile-32.svg" alt="" width={32} height={32} priority />
          <strong>{greeting}</strong>
          <Image src="/icons/home-profile-chevron.svg" alt="" width={20} height={20} />
        </Link>
        <button type="button" className="home-notification-button" aria-label="알림" disabled>
          <span className="home-notification-icon" aria-hidden="true">
            <Image src="/icons/bell.svg" alt="" width={62} height={69} />
          </span>
        </button>
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

      <section
        className="week-strip"
        aria-label="이번 주"
        onPointerDown={handleWeekPointerDown}
        onPointerMove={handleWeekPointerMove}
        onPointerUp={handleWeekPointerUp}
        onPointerCancel={handleWeekPointerCancel}
        onClickCapture={handleWeekClickCapture}
      >
        {week.map(({ day, date, dateKey, isToday, isSelected, progress }) => (
          <button
            key={dateKey}
            type="button"
            className={`${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
            aria-label={`${dateKey} 선택`}
            aria-pressed={isSelected}
            onClick={() => commitSelectedDate(dateKey)}
          >
            <span>{day}</span>
            <strong className={`week-date ${progress}`}>{date}</strong>
          </button>
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
        <div
          className="visit-error home-sync-error"
          role="alert"
          data-failure-source={homeDataFailureSource ?? undefined}
        >
          <span>{syncError}</span>
          <button type="button" disabled={syncRetrying} onClick={() => void handleSyncRetry()}>
            {syncRetrying ? "불러오는 중..." : "다시 시도"}
          </button>
        </div>
      ) : null}

      <section className="home-content">
        <div className="home-segment" role="tablist" aria-label="홈 기록">
          <button
            type="button"
            role="tab"
            aria-selected={activeSegment === "medication"}
            className={activeSegment === "medication" ? "selected" : ""}
            onClick={() => setActiveSegment("medication")}
          >
            복용 기록
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSegment === "mood"}
            className={activeSegment === "mood" ? "selected" : ""}
            onClick={() => setActiveSegment("mood")}
          >
            감정 기록
          </button>
        </div>

        <section className="home-section" role="tabpanel" hidden={activeSegment !== "medication"}>
          {loading ? (
            <div className="home-card loading-card" aria-label="복용약 불러오는 중" />
          ) : displayedMedications.length === 0 ? (
            <div className="home-card empty-medication-card">
              <div className="home-card-copy">
                <strong>복용중인 약을 등록해주세요</strong>
                <p>복용 기록을 습관처럼 이어갈 수 있도록<br />아디가 도와줄게요.</p>
              </div>
              <Link
                href={`/medications/new/search?date=${encodeURIComponent(selectedDateKey)}`}
                className="inline-add-button"
                onClick={() => {
                  resetDraft();
                  startMedicationAddAttempt("home", selectedDateKey);
                }}
              >
                약 등록하기
              </Link>
            </div>
          ) : (
            <div className="home-card populated-medication-card">
              <div className="home-card-heading">
                <Link
                  href={`/medications?date=${encodeURIComponent(selectedDateKey)}`}
                  className="home-card-title"
                  aria-label="복용약 목록 열기"
                  onNavigate={() => trackMedicationManagementOpened(activeMedicationCount)}
                >
                  <strong>{medicationTitle}</strong>
                  <ChevronRight />
                </Link>
              </div>
              <div className="saved-medication-list">
                {displayedMedications.map((medication) => {
                  const intake = selectedIntakeByMedication.get(medication.id);
                  const isTaken = Boolean(intake);
                  const isHistoricalInactive = medication.active === false;
                  const image = resolveMedicationImage({
                    medicationId: medication.catalogId,
                    medicationName: medicationLabel(medication),
                    existingImage: medication.productImage ?? medication.imagePath,
                    fallbackImage: medication.fallbackImage,
                    failedSources: failedMedicationImages,
                  });
                  const isFallbackImage = image.type === "fallback";
                  const displayedImage = image.src;
                  return (
                    <article className="home-medication-item" key={medication.id}>
                      {isHistoricalInactive ? (
                        <span
                          className="medication-check history"
                          role="img"
                          aria-label={`${medicationLabel(medication)} 복용 완료 기록`}
                        >
                          <Image src="/icons/check-circle.svg" alt="" width={20} height={20} />
                        </span>
                      ) : (
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
                      )}
                      <div className={`home-medication-image ${isFallbackImage ? "fallback" : ""}`}>
                        <Image
                          src={displayedImage}
                          alt=""
                          fill
                          sizes="64px"
                          unoptimized={isFallbackImage}
                          onError={() => setFailedMedicationImages((current) => {
                            if (current.has(displayedImage)) return current;
                            const next = new Set(current);
                            next.add(displayedImage);
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

        <section className="home-section" role="tabpanel" hidden={activeSegment !== "mood"}>
          {moodRecord ? (
            <Link
              href={`/moods/${moodRecord.date}`}
              className="home-card recorded-mood-card recorded-mood-card-link"
              aria-label={`${formatDateKey(moodRecord.date)} 감정 기록 상세 보기`}
            >
              <div className="home-card-heading">
                <div className="home-card-title">
                  <strong>{selectedRelation === 0 ? "오늘의 감정" : "감정 기록"}</strong>
                  <ChevronRight />
                </div>
              </div>
              <div className="recorded-mood-item">
                <span className={`recorded-mood-cat-frame mood-result-cat-${moodCatId}`}>
                  <CatRewardImage
                    catId={moodCatId as CatId}
                    alt={moodCat.displayName}
                    width={160}
                    height={160}
                  />
                </span>
                <strong>{getHomeMoodSummary(moodRecord)}</strong>
                <span>{formatRecordTime(moodRecord.recordedAt)} 기록</span>
              </div>
              <div className="mood-diary-card">
                <div className="mood-diary-title">
                  <Image src="/icons/mood-diary.svg" alt="" width={20} height={20} />
                  <strong>병원에서 이렇게 이야기 해보세요</strong>
                </div>
                <p>“{getHomeClinicPhrase(moodRecord)}”</p>
              </div>
            </Link>
          ) : (
            <div className="home-card mood-card date-aware-mood-card">
              <div className="home-card-copy">
                <strong>{moodEmptyTitle}</strong>
                <p>기록만 하면 귀여운 고양이를 만날 수 있어요!</p>
              </div>
              <Image
                className="home-mood-illustration"
                src="/moods/home-empty-cat.png"
                alt=""
                width={160}
                height={160}
                loading="eager"
              />
              <Link
                href={`/moods/new?date=${selectedDateKey}`}
                className="mood-record-link"
                  onClick={() => startMoodAttempt("home", selectedDateKey)}
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

      <BottomNavigation activeTab="home" />

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
          onSelect={handleCalendarSelect}
          onMoveMonth={(amount) => setVisibleMonthKey((current) => moveMonthDateKey(current, amount))}
          onToday={handleCalendarToday}
          onConfirm={handleConfirmCalendar}
          onClose={handleCloseCalendar}
        />
      ) : null}
    </MobileShell>
  );
}
