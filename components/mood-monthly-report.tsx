"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useMoodBottomSheet } from "@/components/use-mood-bottom-sheet";
import {
  buildMoodMonthlyReport,
  formatMoodReportMonth,
  listMoodReportMonths,
} from "@/lib/mood-report";
import type { MoodRecord } from "@/lib/types";

export function MoodMonthlyReport({ records }: { records: MoodRecord[] }) {
  const availableMonths = useMemo(() => listMoodReportMonths(records), [records]);
  const pickerMonths = useMemo(() => [...availableMonths].reverse(), [availableMonths]);
  const latestMonth = availableMonths[0] ?? "";
  const [appliedMonth, setAppliedMonth] = useState(latestMonth);
  const [pendingMonth, setPendingMonth] = useState(latestMonth);
  const [pickerDragOffset, setPickerDragOffset] = useState(0);
  const pickerPointerRef = useRef<{ id: number; startY: number } | null>(null);
  const pickerOptionsRef = useRef<HTMLDivElement | null>(null);
  const suppressPickerClickRef = useRef(false);
  const wheelLockedRef = useRef(false);
  const wheelUnlockTimerRef = useRef<number | null>(null);
  const monthSheet = useMoodBottomSheet();

  useEffect(() => {
    if (availableMonths.length === 0) return;
    if (!availableMonths.includes(appliedMonth)) {
      setAppliedMonth(latestMonth);
      setPendingMonth(latestMonth);
    }
  }, [appliedMonth, availableMonths, latestMonth]);

  const report = useMemo(
    () => buildMoodMonthlyReport(records, appliedMonth),
    [appliedMonth, records],
  );

  function openSheet() {
    setPendingMonth(appliedMonth);
    setPickerDragOffset(0);
    monthSheet.open();
  }

  function confirmMonth() {
    const selectedMonth = pendingMonth;
    monthSheet.close(() => setAppliedMonth(selectedMonth));
  }

  const movePendingMonth = useCallback((offset: number) => {
    setPendingMonth((currentMonth) => {
      const currentIndex = pickerMonths.indexOf(currentMonth);
      if (currentIndex < 0) return pickerMonths[0] ?? currentMonth;
      const nextIndex = Math.min(
        pickerMonths.length - 1,
        Math.max(0, currentIndex + offset),
      );
      return pickerMonths[nextIndex] ?? currentMonth;
    });
  }, [pickerMonths]);

  function handlePickerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pickerPointerRef.current = { id: event.pointerId, startY: event.clientY };
    suppressPickerClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePickerPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pickerPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const offset = Math.max(-32, Math.min(32, event.clientY - pointer.startY));
    if (Math.abs(offset) > 4) suppressPickerClickRef.current = true;
    setPickerDragOffset(offset);
  }

  function finishPickerPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = pickerPointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const offset = event.clientY - pointer.startY;
    pickerPointerRef.current = null;
    setPickerDragOffset(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (Math.abs(offset) >= 18) movePendingMonth(offset < 0 ? 1 : -1);
    window.requestAnimationFrame(() => {
      suppressPickerClickRef.current = false;
    });
  }

  const handlePickerWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();
    if (wheelLockedRef.current || Math.abs(event.deltaY) < 4) return;
    wheelLockedRef.current = true;
    movePendingMonth(event.deltaY > 0 ? 1 : -1);
    if (wheelUnlockTimerRef.current !== null) window.clearTimeout(wheelUnlockTimerRef.current);
    wheelUnlockTimerRef.current = window.setTimeout(() => {
      wheelLockedRef.current = false;
      wheelUnlockTimerRef.current = null;
    }, 180);
  }, [movePendingMonth]);

  useEffect(() => {
    if (!monthSheet.mounted) return;
    const picker = pickerOptionsRef.current;
    if (!picker) return;
    picker.addEventListener("wheel", handlePickerWheel, { passive: false });
    return () => picker.removeEventListener("wheel", handlePickerWheel);
  }, [handlePickerWheel, monthSheet.mounted]);

  useEffect(() => () => {
    if (wheelUnlockTimerRef.current !== null) window.clearTimeout(wheelUnlockTimerRef.current);
  }, []);

  const pendingMonthIndex = Math.max(0, pickerMonths.indexOf(pendingMonth));
  const pickerRowCount = Math.min(3, pickerMonths.length);
  const pickerHeight = pickerRowCount === 0 ? 0 : 48 + ((pickerRowCount - 1) * 56);

  return (
    <section className="mood-monthly-report" aria-label="월간 감정 리포트">
      <button
        type="button"
        className="mood-report-month-select"
        aria-haspopup="dialog"
        aria-expanded={monthSheet.mounted}
        onClick={openSheet}
      >
        <span>{formatMoodReportMonth(appliedMonth)}</span>
        <Image src="/icons/chevron-down.svg" alt="" width={10} height={5} />
      </button>

      <section className="mood-report-summary" aria-labelledby="mood-report-summary-title">
        <h2 id="mood-report-summary-title">전체 요약</h2>
        <div className="mood-report-summary-cards">
          <article>
            <span>4주 동안<br />총 기록 횟수</span>
            <strong>{report.totalDays}일</strong>
          </article>
          <article>
            <span>약 효과가<br />있던 날</span>
            <strong>{report.effectiveMedicationDays}일</strong>
          </article>
          <article>
            <span>대인 관계가<br />어려웠던 날</span>
            <strong>{report.relationshipDifficultyDays}일</strong>
          </article>
        </div>
      </section>

      <section className="mood-report-patterns" aria-labelledby="mood-report-patterns-title">
        <h2 id="mood-report-patterns-title">주요 변화 패턴</h2>
        <div className="mood-report-pattern-list">
          {report.patterns.map((pattern) => (
            <div className="mood-report-pattern" key={pattern.id}>
              <span>{pattern.label}</span>
              <span className="mood-report-pattern-track" aria-hidden="true">
                <span style={{ width: `${pattern.ratio * 100}%` }} />
              </span>
              <strong>{pattern.count}일</strong>
            </div>
          ))}
        </div>
      </section>

      <article className="mood-report-clinic">
        <h2>
          <Image src="/icons/mood-summary-sparkle.svg" alt="" width={20} height={20} />
          병원에서 이렇게 이야기 해보세요
        </h2>
        <p>“{report.clinicPhrase}”</p>
      </article>

      {monthSheet.mounted ? (
        <div
          className={`mood-report-sheet-layer mood-bottom-sheet-layer${monthSheet.entered ? " is-entered" : ""}`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) monthSheet.close();
          }}
        >
          <section
            className="mood-report-sheet mood-bottom-sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mood-report-sheet-title"
          >
            <header>
              <span aria-hidden="true" />
              <h2 id="mood-report-sheet-title">날짜를 선택해주세요</h2>
            </header>
            <div
              ref={pickerOptionsRef}
              className={`mood-report-month-options${pickerDragOffset === 0 ? " is-settling" : " is-dragging"}`}
              role="radiogroup"
              aria-label="리포트 월"
              style={{ height: pickerHeight }}
              onPointerDown={handlePickerPointerDown}
              onPointerMove={handlePickerPointerMove}
              onPointerUp={finishPickerPointer}
              onPointerCancel={finishPickerPointer}
            >
              {pickerMonths.map((month, index) => {
                const selected = pendingMonth === month;
                const relativeIndex = index - pendingMonthIndex;
                const slot = pickerMonths.length <= 2 ? index : relativeIndex + 1;
                const visible = pickerMonths.length <= 2 || Math.abs(relativeIndex) <= 1;
                const pickerStyle = {
                  "--mood-report-picker-y": `${(slot * 56) + pickerDragOffset}px`,
                  "--mood-report-picker-opacity": visible ? (selected ? 1 : 0.58) : 0,
                  "--mood-report-picker-scale": selected ? 1 : 0.97,
                } as CSSProperties;
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-hidden={!visible}
                    className={selected ? "selected" : ""}
                    style={pickerStyle}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      if (!suppressPickerClickRef.current) setPendingMonth(month);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                      event.preventDefault();
                      movePendingMonth(event.key === "ArrowDown" ? 1 : -1);
                    }}
                    key={month}
                  >
                    {formatMoodReportMonth(month)}
                  </button>
                );
              })}
            </div>
            <div className={`mood-report-sheet-actions${pendingMonth !== latestMonth ? " has-reset" : ""}`}>
              {pendingMonth !== latestMonth ? (
                <button
                  type="button"
                  className="mood-report-reset"
                  onClick={() => setPendingMonth(latestMonth)}
                >
                  초기화
                </button>
              ) : null}
              <button type="button" className="mood-report-confirm" onClick={confirmMonth}>
                확인
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
