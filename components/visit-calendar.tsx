"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  compareDateKeys,
  fromDateKey,
  startOfLocalDay,
  toDateKey,
} from "@/lib/visit-date";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type VisitCalendarProps = {
  selectedDate: string | null;
  onSelect: (dateKey: string) => void;
};

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function moveMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function VisitCalendar({ selectedDate, onSelect }: VisitCalendarProps) {
  const today = startOfLocalDay(new Date());
  const todayKey = toDateKey(today);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    selectedDate ? monthStart(fromDateKey(selectedDate)) : monthStart(today),
  );
  const earliestMonth = monthStart(today);
  const canMovePrevious = visibleMonth.getTime() > earliestMonth.getTime();

  const dates = useMemo(() => {
    const first = monthStart(visibleMonth);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const cellCount = Math.ceil((first.getDay() + last.getDate()) / 7) * 7;

    return Array.from({ length: cellCount }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = toDateKey(date);
      const inCurrentMonth = date.getMonth() === visibleMonth.getMonth();
      const isPast = compareDateKeys(dateKey, todayKey) < 0;
      return {
        date,
        dateKey,
        inCurrentMonth,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate,
        disabled: !inCurrentMonth || isPast,
      };
    });
  }, [selectedDate, todayKey, visibleMonth]);

  return (
    <section className="visit-calendar" aria-label="내원일 선택 달력">
      <div className="visit-calendar-month">
        <button
          type="button"
          onClick={() => setVisibleMonth((current) => moveMonth(current, -1))}
          disabled={!canMovePrevious}
          aria-label="이전 달"
        >
          <Image src="/icons/visit-chevron-left.svg" alt="" width={10} height={5} />
        </button>
        <strong>{visibleMonth.getFullYear()}년 {String(visibleMonth.getMonth() + 1).padStart(2, "0")}월</strong>
        <button
          type="button"
          onClick={() => setVisibleMonth((current) => moveMonth(current, 1))}
          aria-label="다음 달"
        >
          <Image src="/icons/visit-chevron-right.svg" alt="" width={10} height={5} />
        </button>
      </div>

      <div className="visit-calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
      </div>

      <div className="visit-calendar-grid">
        {dates.map(({ date, dateKey, isToday, isSelected, disabled }) => (
          <button
            type="button"
            className={`${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
            key={dateKey}
            disabled={disabled}
            aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일${isToday ? ", 오늘" : ""}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(dateKey)}
          >
            <span>{date.getDate()}</span>
            {isToday ? <small>오늘</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
