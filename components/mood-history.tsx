"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { startMoodAttempt } from "@/lib/analytics/events";
import { getKstDateKey } from "@/lib/kst-date";
import { getMoodRepository } from "@/lib/repositories";
import {
  buildMoodHistoryStats, filterMoodRecordsByPeriod, getMoodHistoryPeriod, getMoodHistoryRangeLabel,
  MOOD_HISTORY_PERIODS, type MoodHistoryPeriod,
} from "@/lib/mood-history";
import type { MoodRecord } from "@/lib/types";

export function MoodHistory({ initialPeriod }: { initialPeriod: MoodHistoryPeriod | null }) {
  const [records, setRecords] = useState<MoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<MoodHistoryPeriod | null>(initialPeriod);
  const [pendingPeriod, setPendingPeriod] = useState<MoodHistoryPeriod>(initialPeriod ?? "14d");
  const [sheetOpen, setSheetOpen] = useState(false);
  const selectButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    void getMoodRepository().then((repository) => repository.listAll()).then((saved) => { if (active) setRecords(saved); })
      .catch(() => { if (active) setRecords([]); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setSheetOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? []);
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    sheetRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); selectButtonRef.current?.focus(); };
  }, [sheetOpen]);

  const filtered = useMemo(() => selectedPeriod ? filterMoodRecordsByPeriod(records, selectedPeriod) : [], [records, selectedPeriod]);
  const stats = useMemo(() => buildMoodHistoryStats(filtered), [filtered]);
  const maxPatternCount = Math.max(stats.uniqueDays, 1);
  const selectedLabel = selectedPeriod ? getMoodHistoryRangeLabel(selectedPeriod) : "기간 선택";

  function openSheet() { setPendingPeriod(selectedPeriod ?? "14d"); setSheetOpen(true); }
  function applyPeriod() {
    setSelectedPeriod(pendingPeriod); setSheetOpen(false);
    window.history.replaceState(window.history.state, "", `/moods?period=${pendingPeriod}`);
  }

  return (
    <MobileShell className={`mood-history-screen ${selectedPeriod ? "has-selection" : ""} ${sheetOpen ? "sheet-open" : ""}`}>
      <header className="mood-history-header">
        {selectedPeriod ? (
          <><strong>{getMoodHistoryPeriod(selectedPeriod).optionLabel} 간 기록 일지</strong><Link href="/" className="icon-button"><Image src="/icons/close.svg" alt="" width={16} height={16} /></Link></>
        ) : (
          <><strong>감정기록 상세</strong><Link href="/" className="icon-button" aria-label="홈으로 돌아가기"><Image src="/icons/close.svg" alt="" width={16} height={16} /></Link></>
        )}
      </header>

      {!selectedPeriod ? <section className="mood-history-heading"><h1>조회 기간을 선택해주세요</h1></section> : null}
      <div className="mood-history-select-container">
        <button ref={selectButtonRef} type="button" className={`mood-history-select ${sheetOpen ? "active" : ""}`}
          aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={openSheet}>
          <span className={selectedPeriod ? "selected" : ""}>{selectedLabel}</span>
          <Image src="/icons/chevron-down.svg" alt="" width={10} height={5} />
        </button>
      </div>

      {!loading && selectedPeriod ? filtered.length ? (
        <section className="mood-history-report" aria-live="polite">
          <h2>전체 요약</h2>
          <div className="mood-history-metrics">
            <article><span>{getMoodHistoryPeriod(selectedPeriod).summaryLabel} 동안<br />총 기록 횟수</span><strong>{stats.uniqueDays}일</strong></article>
            <article><span>약 효과가<br />있었던 날</span><strong>{stats.effectRecordedDays}일</strong></article>
            <article><span>대인 관계가<br />어려웠던 날</span><strong>{stats.relationshipDifficultDays}일</strong></article>
          </div>
          {stats.patterns.length ? <>
            <h2>주요 변화 패턴</h2>
            <div className="mood-history-patterns">
              {stats.patterns.map((pattern) => <div className="mood-history-pattern" key={pattern.label}>
                <span>{pattern.label}</span><i><b style={{ width: `${(pattern.count / maxPatternCount) * 100}%` }} /></i><strong>{pattern.count}일</strong>
              </div>)}
            </div>
          </> : null}
          <section className="mood-clinic-card mood-history-clinic"><h2><span aria-hidden="true">✦</span> 병원에서 이렇게 이야기 해보세요</h2><p>“{stats.clinicPhrase}”</p></section>
        </section>
      ) : (
        <section className="mood-history-insufficient" aria-live="polite">
          <Image src="/moods/history-empty.png" alt="" width={120} height={120} priority />
          <h2><span>아직 {getMoodHistoryPeriod(selectedPeriod).optionLabel}</span><span>기록 내용이 부족해요</span></h2>
          <Link href={`/moods/new?date=${getKstDateKey()}`} onClick={() => startMoodAttempt("mood_history")}>감정기록 입력</Link>
        </section>
      ) : null}

      {sheetOpen ? <div className="mood-history-sheet-layer" role="presentation" onClick={() => setSheetOpen(false)}>
        <section ref={sheetRef} className="mood-history-sheet" role="dialog" aria-modal="true" aria-labelledby="mood-history-sheet-title" onClick={(event) => event.stopPropagation()}>
          <div className="mood-history-sheet-header"><span aria-hidden="true" /><h2 id="mood-history-sheet-title">조회 기간을 선택해주세요</h2></div>
          <div className="mood-history-period-options" role="radiogroup" aria-label="조회 기간">
            {MOOD_HISTORY_PERIODS.map((period) => <button type="button" role="radio" aria-checked={pendingPeriod === period.value}
              className={pendingPeriod === period.value ? "selected" : ""} key={period.value} onClick={() => setPendingPeriod(period.value)}>{period.optionLabel}</button>)}
          </div>
          <div className="mood-history-sheet-actions"><button type="button" onClick={applyPeriod}>확인</button></div>
        </section>
      </div> : null}
    </MobileShell>
  );
}
