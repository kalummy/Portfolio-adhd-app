"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { MoodCatCollection } from "@/components/mood-cat-collection";
import { MoodMonthlyReport } from "@/components/mood-monthly-report";
import { useMoodBottomSheet } from "@/components/use-mood-bottom-sheet";
import {
  startMoodAttempt,
  trackCatCollectionViewed,
  trackMoodReportViewed,
} from "@/lib/analytics/events";
import { UNKNOWN_CAT } from "@/lib/cats";
import { getKstDateKey } from "@/lib/kst-date";
import {
  formatMoodRecordDateTime,
  getMoodHistoryDateRange,
  getMoodHistoryPeriod,
  MOOD_HISTORY_PERIODS,
  type MoodHistoryPeriod,
} from "@/lib/mood-history";
import { getMoodRecordDisplayCat } from "@/lib/mood-record-cat";
import { getMoodRepository } from "@/lib/repositories";
import type { MoodRecord } from "@/lib/types";

export const MOOD_DELETED_TOAST_STORAGE_KEY = "addi:mood-deleted-toast:v1";

const TABS = [
  { id: "records", label: "기록순" },
  { id: "report", label: "리포트" },
  { id: "collection", label: "내 고양이" },
] as const;

type MoodTab = (typeof TABS)[number]["id"];

function getRecordCat(record: MoodRecord) {
  return getMoodRecordDisplayCat(record.catId);
}

function getRecordSummary(record: MoodRecord) {
  return record.moodLabel || record.memberSummary || record.diaryEntries?.[0] || "";
}

export function MoodHistory({ showDeletedToast = false }: { showDeletedToast?: boolean }) {
  const [activeTab, setActiveTab] = useState<MoodTab>("records");
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [collectionRecords, setCollectionRecords] = useState<MoodRecord[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [reportRecords, setReportRecords] = useState<MoodRecord[]>([]);
  const [reportLoading, setReportLoading] = useState(true);
  const [deletedToast, setDeletedToast] = useState("");
  const [appliedPeriod, setAppliedPeriod] = useState<MoodHistoryPeriod>("1m");
  const [pendingPeriod, setPendingPeriod] = useState<MoodHistoryPeriod>("1m");
  const periodSheet = useMoodBottomSheet();
  const appliedPeriodLabel = getMoodHistoryPeriod(appliedPeriod).optionLabel;

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

  useEffect(() => {
    if (activeTab !== "records") return;
    void loadRecords();
    window.addEventListener("pageshow", loadRecords);
    window.addEventListener("focus", loadRecords);
    return () => {
      window.removeEventListener("pageshow", loadRecords);
      window.removeEventListener("focus", loadRecords);
    };
  }, [activeTab, loadRecords]);

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

  function selectTab(tab: MoodTab) {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (tab === "collection") void trackCatCollectionViewed();
    if (tab === "report") void trackMoodReportViewed();
  }

  function openPeriodSheet() {
    setPendingPeriod(appliedPeriod);
    periodSheet.open();
  }

  function confirmPeriod() {
    const selectedPeriod = pendingPeriod;
    periodSheet.close(() => setAppliedPeriod(selectedPeriod));
  }

  return (
    <MobileShell className="mood-records-screen">
      <header className="mood-records-header">
        <strong>감정기록 상세</strong>
        <Link href="/" className="icon-button" aria-label="닫기">
          <Image src="/icons/close.svg" alt="" width={16} height={16} />
        </Link>
      </header>

      <nav className="mood-record-tabs" aria-label="감정기록 상세" role="tablist">
        {TABS.map((tab) => {
          const selected = tab.id === activeTab;
          return (
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? "active" : ""}
              onClick={() => selectTab(tab.id)}
              data-mp-replay-allow-interaction=""
              data-mp-replay-public=""
              key={tab.id}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeTab === "records" && !loading ? (
        <button
          type="button"
          className="mood-record-period"
          aria-label={`조회 기간 최근 ${appliedPeriodLabel}`}
          aria-haspopup="dialog"
          aria-expanded={periodSheet.mounted}
          onClick={openPeriodSheet}
          data-mp-replay-allow-interaction=""
          data-mp-replay-public=""
        >
          <span>최근 {appliedPeriodLabel}</span>
          <Image src="/icons/chevron-down.svg" alt="" width={10} height={5} />
        </button>
      ) : null}

      {activeTab === "records" && !loading && records.length > 0 ? (
        <>
          <section
            className="mood-record-list"
            aria-label={`최근 ${appliedPeriodLabel} 감정 기록`}
            data-mp-replay-block=""
          >
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
                    <Image src={cat.imagePath} alt={cat.displayName} fill sizes="64px" />
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

      {activeTab === "records" && !loading && records.length === 0 ? (
        <section className="mood-record-empty" aria-live="polite">
          <span className="mood-record-empty-cat" data-mp-replay-block="">
            <Image src={UNKNOWN_CAT.imagePath} alt="" fill sizes="160px" priority />
          </span>
          <h1 data-mp-replay-block="">아직 감정 기록이 없어요</h1>
          <Link
            href={`/moods/new?date=${getKstDateKey()}`}
            onClick={() => startMoodAttempt("mood_history")}
            data-mp-replay-allow-interaction=""
            data-mp-replay-public=""
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
          <span className="mood-record-empty-cat" data-mp-replay-block="">
            <Image src={UNKNOWN_CAT.imagePath} alt="" fill sizes="160px" priority />
          </span>
          <h1 data-mp-replay-block="">아직 감정 기록이 없어요</h1>
          <Link
            href={`/moods/new?date=${getKstDateKey()}`}
            onClick={() => startMoodAttempt("mood_history")}
            data-mp-replay-allow-interaction=""
            data-mp-replay-public=""
          >
            감정기록 입력
          </Link>
        </section>
      ) : null}

      {deletedToast ? (
        <div className="mood-record-deleted-toast" role="status" data-mp-replay-block="">
          <Image src="/icons/mood-delete-warning.svg" alt="" width={18} height={18} />
          <span>{deletedToast}</span>
        </div>
      ) : null}

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
                  data-mp-replay-allow-interaction=""
                  data-mp-replay-public=""
                  key={period.value}
                >
                  {period.optionLabel}
                </button>
              ))}
            </div>
            <div className="mood-history-sheet-actions">
              <button
                type="button"
                onClick={confirmPeriod}
                data-mp-replay-allow-interaction=""
                data-mp-replay-public=""
              >
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
