"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppTabBar } from "@/components/app-tab-bar";
import { MobileShell } from "@/components/mobile-shell";
import { CatRewardImage } from "@/components/cat-reward-image";
import { MoodCatCollection } from "@/components/mood-cat-collection";
import { MoodMonthlyReport } from "@/components/mood-monthly-report";
import { useMoodBottomSheet } from "@/components/use-mood-bottom-sheet";
import {
  startMedicationAddAttempt,
  startMoodAttempt,
  trackCatCollectionViewed,
  trackMoodReportViewed,
} from "@/lib/analytics/events";
import { UNKNOWN_CAT } from "@/lib/cats";
import { KST_TIME_ZONE, getKstDateKey } from "@/lib/kst-date";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { resolveMedicationImage } from "@/lib/medication-images";
import { medicationLabel } from "@/lib/medication-utils";
import {
  formatMoodRecordDate,
  formatMoodRecordDateTime,
  getMoodHistoryDateRange,
  getMoodHistoryPeriod,
  MOOD_HISTORY_PERIODS,
  type MoodHistoryPeriod,
} from "@/lib/mood-history";
import { getMoodRecordDisplayCat } from "@/lib/mood-record-cat";
import { getDataRepositories, getMoodRepository } from "@/lib/repositories";
import { resetDraft } from "@/lib/registration-session";
import type { MedicationIntakeRecord, MoodRecord, SavedMedication } from "@/lib/types";

export const MOOD_DELETED_TOAST_STORAGE_KEY = "addi:mood-deleted-toast:v1";

const TABS = [
  { id: "medications", label: "복약" },
  { id: "moods", label: "감정" },
  { id: "report", label: "리포트" },
  { id: "collection", label: "내 고양이" },
] as const;

export type RecordsTab = (typeof TABS)[number]["id"];

type MoodTab = RecordsTab;

type IntakeListItem = {
  intake: MedicationIntakeRecord;
  medication: SavedMedication | null;
};

function getRecordCat(record: MoodRecord) {
  return getMoodRecordDisplayCat(record.catId);
}

function getRecordSummary(record: MoodRecord) {
  return record.moodLabel || record.memberSummary || record.diaryEntries?.[0] || "";
}

function isRecordsTab(value: string | undefined): value is RecordsTab {
  return TABS.some((tab) => tab.id === value);
}

function formatIntakeRecordTime(iso: string) {
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

function groupIntakesByDate(items: IntakeListItem[]) {
  const groups: { date: string; items: IntakeListItem[] }[] = [];
  const indexByDate = new Map<string, number>();
  const sorted = [...items].sort((left, right) => (
    right.intake.date.localeCompare(left.intake.date)
    || right.intake.recordedAt.localeCompare(left.intake.recordedAt)
  ));
  for (const item of sorted) {
    const date = item.intake.date;
    const existing = indexByDate.get(date);
    if (existing == null) {
      indexByDate.set(date, groups.length);
      groups.push({ date, items: [item] });
      continue;
    }
    groups[existing].items.push(item);
  }
  return groups;
}

function MedicationRecordImage({ medication }: { medication: SavedMedication | null }) {
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const label = medication ? medicationLabel(medication) : "약";
  const image = resolveMedicationImage({
    medicationId: medication?.catalogId,
    medicationName: label,
    existingImage: medication?.productImage ?? medication?.imagePath,
    fallbackImage: medication?.fallbackImage ?? medication?.imagePath,
    failedSources,
  });

  useEffect(() => setFailedSources(new Set()), [
    medication?.fallbackImage,
    medication?.imagePath,
    medication?.catalogId,
    medication?.productImage,
    label,
  ]);

  return (
    <span className={`mood-record-list-med ${image.type === "fallback" ? "fallback" : ""}`}>
      <Image
        src={image.src}
        alt=""
        fill
        sizes="64px"
        unoptimized={image.type === "fallback"}
        onError={() => setFailedSources((current) => new Set(current).add(image.src))}
      />
    </span>
  );
}

export function MoodHistory({
  showDeletedToast = false,
  initialTab,
}: {
  showDeletedToast?: boolean;
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<MoodTab>(
    showDeletedToast ? "moods" : isRecordsTab(initialTab) ? initialTab : "medications",
  );
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionRecords, setCollectionRecords] = useState<MoodRecord[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [reportRecords, setReportRecords] = useState<MoodRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(true);
  const [intakeRecords, setIntakeRecords] = useState<MedicationIntakeRecord[]>([]);
  const [savedMedications, setSavedMedications] = useState<SavedMedication[]>([]);
  const [medicationLoading, setMedicationLoading] = useState(true);
  const [deletedToast, setDeletedToast] = useState("");
  const [appliedPeriod, setAppliedPeriod] = useState<MoodHistoryPeriod>("1m");
  const [pendingPeriod, setPendingPeriod] = useState<MoodHistoryPeriod>("1m");
  const periodSheet = useMoodBottomSheet();
  const appliedPeriodLabel = getMoodHistoryPeriod(appliedPeriod).optionLabel;
  const todayDateKey = getKstDateKey();
  const activeMedicationCount = savedMedications.filter((medication) => medication.active !== false).length;

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const repository = await getMoodRepository();
      const { startDate, endDate } = getMoodHistoryDateRange(appliedPeriod);
      setRecords(await repository.listRecent(startDate, endDate));
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [appliedPeriod]);

  const loadCollectionRecords = useCallback(async () => {
    setCollectionLoading(true);
    try {
      const repository = await getMoodRepository();
      setCollectionRecords(await repository.listAll());
    } catch {
      setCollectionRecords([]);
    } finally {
      setCollectionLoading(false);
    }
  }, []);

  const loadReportRecords = useCallback(async () => {
    setReportLoading(true);
    try {
      const repository = await getMoodRepository();
      setReportRecords(await repository.listAll());
    } catch {
      setReportRecords([]);
    } finally {
      setReportLoading(false);
    }
  }, []);

  const loadMedicationRecords = useCallback(async () => {
    setMedicationLoading(true);
    try {
      const repositories = await getDataRepositories();
      const { startDate, endDate } = getMoodHistoryDateRange(appliedPeriod);
      const [medications, intakes] = await Promise.all([
        repositories.medications.listAll(),
        repositories.medicationIntakes.listAll(),
      ]);
      setSavedMedications(medications);
      setIntakeRecords(
        intakes.filter((record) => (
          record.taken && record.date >= startDate && record.date <= endDate
        )),
      );
      void enrichOfficialMedications(medications).then((enrichedMedications) => {
        const enrichedById = new Map(
          enrichedMedications.map((medication) => [medication.id, medication]),
        );
        setSavedMedications((current) => current.map(
          (medication) => enrichedById.get(medication.id) ?? medication,
        ));
      });
    } catch {
      setSavedMedications([]);
      setIntakeRecords([]);
    } finally {
      setMedicationLoading(false);
    }
  }, [appliedPeriod]);

  useEffect(() => {
    if (activeTab !== "moods") return;
    void loadRecords();
    window.addEventListener("pageshow", loadRecords);
    window.addEventListener("focus", loadRecords);
    return () => {
      window.removeEventListener("pageshow", loadRecords);
      window.removeEventListener("focus", loadRecords);
    };
  }, [activeTab, loadRecords]);

  useEffect(() => {
    if (activeTab !== "medications") return;
    void loadMedicationRecords();
    window.addEventListener("pageshow", loadMedicationRecords);
    window.addEventListener("focus", loadMedicationRecords);
    return () => {
      window.removeEventListener("pageshow", loadMedicationRecords);
      window.removeEventListener("focus", loadMedicationRecords);
    };
  }, [activeTab, loadMedicationRecords]);

  useEffect(() => {
    if (activeTab !== "collection") return;
    void loadCollectionRecords();
    window.addEventListener("pageshow", loadCollectionRecords);
    window.addEventListener("focus", loadCollectionRecords);
    return () => {
      window.removeEventListener("pageshow", loadCollectionRecords);
      window.removeEventListener("focus", loadCollectionRecords);
    };
  }, [activeTab, loadCollectionRecords]);

  useEffect(() => {
    if (activeTab !== "report") return;
    void loadReportRecords();
    window.addEventListener("pageshow", loadReportRecords);
    window.addEventListener("focus", loadReportRecords);
    return () => {
      window.removeEventListener("pageshow", loadReportRecords);
      window.removeEventListener("focus", loadReportRecords);
    };
  }, [activeTab, loadReportRecords]);

  useEffect(() => {
    if (!showDeletedToast) return;
    let dateLabel = "";
    try {
      dateLabel = window.sessionStorage.getItem(MOOD_DELETED_TOAST_STORAGE_KEY) ?? "";
      window.sessionStorage.removeItem(MOOD_DELETED_TOAST_STORAGE_KEY);
    } catch {
      // Deletion remains complete when session storage is unavailable.
    }

    if (dateLabel) setDeletedToast(`${dateLabel} 기록을 삭제했어요.`);
    const url = new URL(window.location.href);
    url.searchParams.delete("deleted");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const timer = window.setTimeout(() => setDeletedToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [showDeletedToast]);

  const medicationById = useMemo(
    () => new Map(savedMedications.map((medication) => [medication.id, medication])),
    [savedMedications],
  );
  const intakeItems = useMemo(
    () => intakeRecords.map((intake) => ({
      intake,
      medication: medicationById.get(intake.medicationId) ?? null,
    })),
    [intakeRecords, medicationById],
  );
  const intakeGroups = useMemo(() => groupIntakesByDate(intakeItems), [intakeItems]);

  function selectTab(tab: MoodTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (tab === "collection") void trackCatCollectionViewed();
    if (tab === "report") void trackMoodReportViewed();
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function openPeriodSheet() {
    setPendingPeriod(appliedPeriod);
    periodSheet.open();
  }

  function confirmPeriod() {
    const selectedPeriod = pendingPeriod;
    periodSheet.close(() => setAppliedPeriod(selectedPeriod));
  }

  const showPeriod = (activeTab === "medications" && !medicationLoading)
    || (activeTab === "moods" && !loading);

  return (
    <>
      <header className="mood-records-header">
        <strong>기록</strong>
      </header>

      <MobileShell className="mood-records-screen">
      <nav className="mood-record-tabs" aria-label="기록" role="tablist">
        {TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? "active" : ""}
              onClick={() => selectTab(tab.id)}
              key={tab.id}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {showPeriod ? (
        <button
          type="button"
          className="mood-record-period"
          aria-label={`조회 기간 최근 ${appliedPeriodLabel}`}
          aria-haspopup="dialog"
          aria-expanded={periodSheet.mounted}
          onClick={openPeriodSheet}
        >
          <span>최근 {appliedPeriodLabel}</span>
          <Image src="/icons/chevron-down.svg" alt="" width={10} height={5} />
        </button>
      ) : null}

      {activeTab === "medications" && !medicationLoading && activeMedicationCount > 0 ? (
        <Link
          href={`/medications?date=${encodeURIComponent(todayDateKey)}&origin=records`}
          className="records-manage-link"
        >
          <span>
            <strong>복용약 관리</strong>
            <span>{activeMedicationCount}개</span>
          </span>
          <span className="records-manage-chevron" aria-hidden="true">
            <Image src="/icons/chevron-right.svg" alt="" width={12} height={6} />
          </span>
        </Link>
      ) : null}

      {activeTab === "medications" && !medicationLoading && intakeGroups.length > 0 ? (
        <section className="mood-record-list" aria-label={`최근 ${appliedPeriodLabel} 복약 기록`}>
          {intakeGroups.map((group) => (
            <div className="records-date-group" key={group.date}>
              <h2 className="records-date-heading">{formatMoodRecordDate(group.date)}</h2>
              {group.items.map((item) => {
                const medication = item.medication;
                const label = medication ? medicationLabel(medication) : "삭제된 약";
                const canManage = medication != null && medication.active !== false;
                const content = (
                  <>
                    <MedicationRecordImage medication={medication} />
                    <span className="mood-record-list-info">
                      <span>{formatIntakeRecordTime(item.intake.recordedAt)} 복용</span>
                      <strong>{label}</strong>
                    </span>
                  </>
                );
                return canManage ? (
                  <Link
                    href={`/medications/${encodeURIComponent(medication.id)}/schedule?date=${encodeURIComponent(item.intake.date)}&origin=records`}
                    className="mood-record-list-item medication-record-item"
                    aria-label={`${formatMoodRecordDate(item.intake.date)} ${label} ${formatIntakeRecordTime(item.intake.recordedAt)} 복용`}
                    key={item.intake.id}
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    className="mood-record-list-item medication-record-item static"
                    key={item.intake.id}
                  >
                    {content}
                  </div>
                );
              })}
            </div>
          ))}
        </section>
      ) : null}

      {activeTab === "medications" && !medicationLoading && intakeGroups.length === 0 ? (
        <section className="mood-record-empty" aria-live="polite">
          <h1>
            {activeMedicationCount > 0 ? "이 기간에 복용 기록이 없어요" : "아직 복약 기록이 없어요"}
          </h1>
          {activeMedicationCount > 0 ? (
            <Link href="/">홈에서 복용 기록</Link>
          ) : (
            <Link
              href={`/medications/new/search?origin=medications&date=${encodeURIComponent(todayDateKey)}`}
              onClick={() => {
                resetDraft();
                startMedicationAddAttempt("medication_management");
              }}
            >
              약 등록하기
            </Link>
          )}
        </section>
      ) : null}

      {activeTab === "moods" && !loading && records.length > 0 ? (
        <>
          <section className="mood-record-list" aria-label={`최근 ${appliedPeriodLabel} 감정 기록`}>
            {records.map((record) => {
              const cat = getRecordCat(record);
              return (
                <Link
                  href={`/moods/${record.date}`}
                  className="mood-record-list-item"
                  aria-label={`${formatMoodRecordDateTime(record)} ${getRecordSummary(record)}`}
                  key={record.id}
                >
                  <span className={`mood-record-list-cat cat-${cat.id}`}>
                    <CatRewardImage catId={cat.id} alt={cat.displayName} fill sizes="64px" />
                  </span>
                  <span className="mood-record-list-info">
                    <span>{formatMoodRecordDateTime(record)}</span>
                    <strong>{getRecordSummary(record)}</strong>
                  </span>
                </Link>
              );
            })}
          </section>
        </>
      ) : null}

      {activeTab === "moods" && !loading && records.length === 0 ? (
        <section className="mood-record-empty" aria-live="polite">
          <span className="mood-record-empty-cat">
            <Image src={UNKNOWN_CAT.imagePath} alt="" fill sizes="160px" priority />
          </span>
          <h1>아직 감정 기록이 없어요</h1>
          <Link
            href={`/moods/new?date=${getKstDateKey()}`}
            onClick={() => startMoodAttempt("mood_history")}
          >
            감정기록 입력
          </Link>
        </section>
      ) : null}

      {activeTab === "collection" && !collectionLoading ? (
        <MoodCatCollection records={collectionRecords} />
      ) : null}

      {activeTab === "report" && !reportLoading && reportRecords.length > 0 ? (
        <MoodMonthlyReport records={reportRecords} />
      ) : null}

      {activeTab === "report" && !reportLoading && reportRecords.length === 0 ? (
        <section className="mood-record-empty" aria-live="polite">
          <span className="mood-record-empty-cat">
            <Image src={UNKNOWN_CAT.imagePath} alt="" fill sizes="160px" priority />
          </span>
          <h1>아직 감정 기록이 없어요</h1>
          <Link
            href={`/moods/new?date=${getKstDateKey()}`}
            onClick={() => startMoodAttempt("mood_history")}
          >
            감정기록 입력
          </Link>
        </section>
      ) : null}

      {deletedToast ? (
        <div className="mood-record-deleted-toast" role="status">
          <Image src="/icons/mood-delete-warning.svg" alt="" width={18} height={18} />
          <span>{deletedToast}</span>
        </div>
      ) : null}

      <AppTabBar active="moods" />

      {periodSheet.mounted ? (
        <div
          className={`mood-history-sheet-layer mood-bottom-sheet-layer${periodSheet.entered ? " is-entered" : ""}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) periodSheet.close();
          }}
        >
          <section
            className="mood-history-sheet mood-bottom-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mood-history-period-title"
          >
            <header className="mood-history-sheet-header">
              <span aria-hidden="true" />
              <h2 id="mood-history-period-title">조회 기간을 선택해주세요</h2>
            </header>
            <div className="mood-history-period-options" role="radiogroup" aria-label="조회 기간">
              {MOOD_HISTORY_PERIODS.map((period) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={pendingPeriod === period.value}
                  className={pendingPeriod === period.value ? "selected" : ""}
                  onClick={() => setPendingPeriod(period.value)}
                  key={period.value}
                >
                  {period.optionLabel}
                </button>
              ))}
            </div>
            <div className="mood-history-sheet-actions">
              <button type="button" onClick={confirmPeriod}>확인</button>
            </div>
          </section>
        </div>
      ) : null}
      </MobileShell>
    </>
  );
}
