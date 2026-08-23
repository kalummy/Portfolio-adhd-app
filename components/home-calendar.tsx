"use client";

import Image from "next/image";
import { useMemo } from "react";
import { getWeekProgress } from "@/lib/home-week-progress";
import {
  formatDateKey,
  getMonthCalendarDateKeys,
  parseDateKey,
  startOfMonthDateKey,
} from "@/lib/kst-date";
import type { MedicationIntakeRecord, MoodRecord } from "@/lib/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type HomeCalendarProps = {
  visibleMonthKey: string;
  pendingDateKey: string;
  todayKey: string;
  intakeRecords: MedicationIntakeRecord[];
  moodRecords: MoodRecord[];
  onSelect: (dateKey: string) => void;
  onMoveMonth: (amount: number) => void;
  onToday: () => void;
};

export function HomeCalendar({
  visibleMonthKey,
  pendingDateKey,
  todayKey,
  intakeRecords,
  moodRecords,
  onSelect,
  onMoveMonth,
  onToday,
}: HomeCalendarProps) {
  const visibleMonth = parseDateKey(visibleMonthKey)!;
  const monthStart = startOfMonthDateKey(visibleMonthKey);
  const dates = useMemo(
    () => getMonthCalendarDateKeys(visibleMonthKey),
    [visibleMonthKey],
  );

  return (
    <section className="home-calendar" aria-label="날짜 선택 달력">
      <div className="home-calendar-picker-header">
        <div className="home-calendar-month">
          <div className="home-calendar-month-navigation">
            <button type="button" onClick={() => onMoveMonth(-1)} aria-label="이전 달">
              <Image src="/icons/visit-chevron-right.svg" alt="" width={10} height={5} />
            </button>
            <strong>{visibleMonth.year}년 {String(visibleMonth.month).padStart(2, "0")}월</strong>
            <button type="button" onClick={() => onMoveMonth(1)} aria-label="다음 달">
              <Image src="/icons/visit-chevron-right.svg" alt="" width={10} height={5} />
            </button>
          </div>
          <button
            type="button"
            className="home-calendar-today"
            onClick={onToday}
          >
            오늘
          </button>
        </div>

        <div className="home-calendar-weekdays" aria-hidden="true">
          {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
        </div>
      </div>

      <div className="home-calendar-grid">
        {dates.map((dateKey) => {
          const date = parseDateKey(dateKey)!;
          const isToday = dateKey === todayKey;
          const isSelected = dateKey === pendingDateKey;
          const isOutsideMonth = startOfMonthDateKey(dateKey) !== monthStart;
          const progress = getWeekProgress(dateKey, intakeRecords, moodRecords);

          return (
            <button
              type="button"
              className={`${progress} ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${isOutsideMonth ? "outside" : ""}`}
              key={dateKey}
              aria-label={`${formatDateKey(dateKey, true)}${isToday ? ", 오늘" : ""}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(dateKey)}
            >
              <span className="home-calendar-date-content">
                <strong>{date.day}</strong>
                {isToday ? <small>오늘</small> : null}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
