"use client";

import { useEffect, useRef } from "react";
import { HomeCalendar } from "@/components/home-calendar";
import type { MedicationIntakeRecord, MoodRecord } from "@/lib/types";

type HomeDatePickerSheetProps = {
  visibleMonthKey: string;
  pendingDateKey: string;
  todayKey: string;
  intakeRecords: MedicationIntakeRecord[];
  moodRecords: MoodRecord[];
  onSelect: (dateKey: string) => void;
  onMoveMonth: (amount: number) => void;
  onToday: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function HomeDatePickerSheet({
  visibleMonthKey,
  pendingDateKey,
  todayKey,
  intakeRecords,
  moodRecords,
  onSelect,
  onMoveMonth,
  onToday,
  onConfirm,
  onClose,
}: HomeDatePickerSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    dialog?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (!items.includes(document.activeElement as HTMLElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div className="home-date-picker-layer">
      <button
        type="button"
        className="home-date-picker-dimmed"
        aria-label="날짜 선택 닫기"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="home-date-picker-sheet"
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="home-date-picker-title"
      >
        <div className="home-date-picker-header">
          <div className="home-date-picker-handle" aria-hidden="true" />
          <h2 id="home-date-picker-title">날짜를 선택해주세요</h2>
        </div>
        <HomeCalendar
          visibleMonthKey={visibleMonthKey}
          pendingDateKey={pendingDateKey}
          todayKey={todayKey}
          intakeRecords={intakeRecords}
          moodRecords={moodRecords}
          onSelect={onSelect}
          onMoveMonth={onMoveMonth}
          onToday={onToday}
        />
        <div className="home-date-picker-actions">
          <button type="button" onClick={onConfirm}>확인</button>
        </div>
        <div className="home-date-picker-homebar" aria-hidden="true" />
      </div>
    </div>
  );
}
