"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { startMoodAttempt } from "@/lib/analytics/events";
import { getMoodRecords } from "@/lib/indexed-db";
import {
  filterMoodRecordsByPeriod,
  getMoodHistoryPeriod,
  MOOD_HISTORY_PERIODS,
  type MoodHistoryPeriod,
} from "@/lib/mood-history";
import { getMoodDiarySummary, getMoodPresentation } from "@/lib/mood-summary";
import type { MoodRecord } from "@/lib/types";

type MoodHistoryProps = {
  initialPeriod: MoodHistoryPeriod | null;
};

function formatRecordedAt(recordedAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(recordedAt));
}

export function MoodHistory({ initialPeriod }: MoodHistoryProps) {
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<MoodHistoryPeriod | null>(initialPeriod);
  const [pendingPeriod, setPendingPeriod] = useState<MoodHistoryPeriod>(initialPeriod ?? "1w");
  const [sheetOpen, setSheetOpen] = useState(false);
  const selectButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    void getMoodRecords()
      .then((savedRecords) => {
        if (active) setRecords(savedRecords);
      })
      .catch(() => {
        if (active) setRecords([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSheetOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(
        sheetRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), [href], input:not(:disabled)") ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    sheetRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      selectButtonRef.current?.focus();
    };
  }, [sheetOpen]);

  const filteredRecords = useMemo(
    () => selectedPeriod
      ? filterMoodRecordsByPeriod(records, selectedPeriod)
      : [],
    [records, selectedPeriod],
  );
  const latestRecord = filteredRecords[0] ?? null;
  const selectedLabel = selectedPeriod
    ? getMoodHistoryPeriod(selectedPeriod).selectLabel
    : "기간 선택";

  function openSheet() {
    setPendingPeriod(selectedPeriod ?? "1w");
    setSheetOpen(true);
  }

  function applyPeriod() {
    setSelectedPeriod(pendingPeriod);
    setSheetOpen(false);
    window.history.replaceState(window.history.state, "", `/moods?period=${pendingPeriod}`);
  }

  return (
    <MobileShell className={`mood-history-screen ${selectedPeriod ? "has-selection" : ""} ${sheetOpen ? "sheet-open" : ""}`}>
      <header className="mood-history-header">
        <Link href="/" className="icon-button mood-history-back" aria-label="홈으로 돌아가기">
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </Link>
        <strong>오늘의 감정</strong>
      </header>

      <section className="mood-history-heading">
        <h1>조회 기간을 선택해주세요</h1>
      </section>

      <div className="mood-history-select-container">
        <button
          ref={selectButtonRef}
          type="button"
          className={`mood-history-select ${sheetOpen ? "active" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={openSheet}
        >
          <span className={selectedPeriod ? "selected" : ""}>{selectedLabel}</span>
          <span className="mood-history-select-icon" aria-hidden="true">
            <Image src="/icons/chevron-down.svg" alt="" width={10} height={5} />
          </span>
        </button>
      </div>

      {!loading && selectedPeriod ? (
        latestRecord ? (
          <section className="mood-history-result" aria-live="polite">
            <div className="mood-history-mood-item">
              <Image
                src={getMoodPresentation(latestRecord.mood).imagePath}
                alt=""
                width={120}
                height={120}
                priority
              />
              <div className="mood-history-mood-info">
                <h2>{latestRecord.moodLabel}</h2>
                <p>{formatRecordedAt(latestRecord.recordedAt)} 기록</p>
              </div>
            </div>
            <section className="mood-history-summary">
              <div className="mood-history-summary-title">
                <Image src="/icons/mood-diary.svg" alt="" width={20} height={20} />
                <h3>오늘의 일기</h3>
              </div>
              <p>{getMoodDiarySummary(latestRecord.diaryEntries)}</p>
            </section>
          </section>
        ) : (
          <section className="mood-history-insufficient" aria-live="polite">
            <Image src="/moods/history-empty.png" alt="" width={120} height={120} priority />
            <h2>
              <span>아직 1주일</span>
              <span>기록 내역이 부족해요</span>
            </h2>
            <Link href="/moods/new" onClick={() => startMoodAttempt("mood_history")}>
              감정기록 입력
            </Link>
          </section>
        )
      ) : null}

      {sheetOpen ? (
        <div className="mood-history-sheet-layer" role="presentation" onClick={() => setSheetOpen(false)}>
          <section
            ref={sheetRef}
            className="mood-history-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mood-history-sheet-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mood-history-sheet-header">
              <span aria-hidden="true" />
              <h2 id="mood-history-sheet-title">조회 기간을 선택해주세요</h2>
            </div>
            <div className="mood-history-period-options" role="radiogroup" aria-label="조회 기간">
              {MOOD_HISTORY_PERIODS.map((period) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={pendingPeriod === period.value}
                  className={pendingPeriod === period.value ? "selected" : ""}
                  key={period.value}
                  onClick={() => setPendingPeriod(period.value)}
                >
                  {period.optionLabel}
                </button>
              ))}
            </div>
            <div className="mood-history-sheet-actions">
              <button type="button" onClick={applyPeriod}>확인</button>
            </div>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
