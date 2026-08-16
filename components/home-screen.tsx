"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMedicationIntakeRecords,
  getMoodRecords,
  getSavedMedications,
  setMedicationTaken,
} from "@/lib/indexed-db";
import { getWeekProgress } from "@/lib/home-week-progress";
import { medicationLabel } from "@/lib/medication-utils";
import type { HomeDataSet, MedicationIntakeRecord, MoodRecord, SavedMedication } from "@/lib/types";
import { MobileShell } from "./mobile-shell";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DEFAULT_DIARY_ENTRIES = [
  "오늘 내 감정은 대체로 기분이 좋아요.",
  "복용하면서 특별한 부작용을 느끼지 못했어요.",
];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return startOfDay(next);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function relationToReference(date: Date, referenceDate: Date) {
  return Math.round((startOfDay(date).getTime() - startOfDay(referenceDate).getTime()) / 86_400_000);
}

function formatSelectedDate(date: Date, referenceDate: Date) {
  if (relationToReference(date, referenceDate) === 0) return "오늘";
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${DAY_LABELS[date.getDay()]}`;
}

function formatDateEyebrow(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatRecordTime(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
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
};

export function HomeScreen({
  previewData,
  referenceDateKey,
  initialDateKey,
  minimumDateKey,
  maximumDateKey,
}: HomeScreenProps = {}) {
  const referenceDate = useMemo(
    () => (referenceDateKey ? fromDateKey(referenceDateKey) : startOfDay(new Date())),
    [referenceDateKey],
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    initialDateKey ? fromDateKey(initialDateKey) : referenceDate,
  );
  const [medications, setMedications] = useState<SavedMedication[]>(previewData?.medications ?? []);
  const [intakeRecords, setIntakeRecords] = useState<MedicationIntakeRecord[]>(
    previewData?.intakeRecords ?? [],
  );
  const [moodRecords, setMoodRecords] = useState<MoodRecord[]>(previewData?.moodRecords ?? []);
  const [loading, setLoading] = useState(!previewData);

  const selectedDateKey = toDateKey(selectedDate);
  const selectedRelation = relationToReference(selectedDate, referenceDate);

  const load = useCallback(async () => {
    if (previewData) {
      setMedications(previewData.medications);
      setIntakeRecords(previewData.intakeRecords);
      setMoodRecords(previewData.moodRecords);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [savedMedications, savedIntakes, savedMoods] = await Promise.all([
        getSavedMedications(),
        getMedicationIntakeRecords(),
        getMoodRecords(),
      ]);
      setMedications(savedMedications);
      setIntakeRecords(savedIntakes);
      setMoodRecords(savedMoods);
    } finally {
      setLoading(false);
    }
  }, [previewData, selectedDateKey]);

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
    const sunday = addDays(selectedDate, -selectedDate.getDay());

    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(sunday, index);
      const dateKey = toDateKey(date);
      const progress = getWeekProgress(dateKey, medications, intakeRecords, moodRecords);

      return {
        day: DAY_LABELS[date.getDay()],
        date: date.getDate(),
        dateKey,
        isToday: dateKey === toDateKey(referenceDate),
        progress,
      };
    });
  }, [intakeRecords, medications, moodRecords, referenceDate, selectedDate]);

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

    await setMedicationTaken(medicationId, selectedDateKey, !isTaken);
    await load();
  };

  const handleMoveDate = (amount: number) => {
    setSelectedDate((date) => {
      const next = addDays(date, amount);
      if (minimumDateKey && next < fromDateKey(minimumDateKey)) return date;
      if (maximumDateKey && next > fromDateKey(maximumDateKey)) return date;
      return next;
    });
  };

  const moodEmptyTitle =
    selectedRelation === 0
      ? "오늘의 감정은 어떤가요?"
      : selectedRelation < 0
        ? "오늘의 감정은 어땠나요?"
        : "내일 감정을 기록해주세요";
  const medicationTitle = selectedRelation > 0 ? "내일 복용약" : "오늘 복용약";
  const showDateEyebrow = selectedRelation !== 0;

  return (
    <MobileShell className="home-screen">
      <header className="home-header">
        <Image src="/brand/addi-wordmark.svg" alt="ADDI" width={70} height={28} priority />
        <button type="button" className="calendar-button" aria-label="캘린더 열기">
          <Image className="calendar-glyph" src="/icons/calendar.svg" alt="" width={21} height={23} />
        </button>
      </header>

      <section className="week-strip" aria-label="이번 주">
        {week.map(({ day, date, dateKey, isToday, progress }) => (
          <div key={dateKey} className={isToday ? "today" : ""}>
            <span>{day}</span>
            <strong className={`week-date ${progress}`}>{date}</strong>
          </div>
        ))}
      </section>

      <section className="appointment-row">
        <span className="clinic-icon" aria-hidden="true">
          <Image className="appointment-base" src="/icons/appointment-base.svg" alt="" width={20} height={20} />
          <Image className="appointment-top" src="/icons/appointment-top.svg" alt="" width={8} height={10} />
        </span>
        <strong>{medications.length === 0 ? "다음 내원일을 선택해주세요" : "다음 내원일"}</strong>
        {medications.length === 0 ? (
          <ChevronRight />
        ) : (
          <span className="appointment-countdown">
            <strong>D-28</strong>
            <ChevronRight />
          </span>
        )}
      </section>

      <section className="home-content">
        <div className="date-heading">
          <button type="button" aria-label="이전 날" onClick={() => handleMoveDate(-1)}>
            <span className="date-chevron date-chevron-left" aria-hidden="true">
              <Image src="/icons/date-chevron-left.svg" alt="" width={12} height={6} />
            </span>
          </button>
          <strong>{formatSelectedDate(selectedDate, referenceDate)}</strong>
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
              <Link href="/medications/new" className="inline-add-button">약 등록하기</Link>
            </div>
          ) : (
            <div className="home-card populated-medication-card">
              <div className={`home-card-heading ${showDateEyebrow ? "with-date" : ""}`}>
                {showDateEyebrow && <span className="card-date-eyebrow">{formatDateEyebrow(selectedDate)}</span>}
                <Link href="/medications/new" className="home-card-title" aria-label="복용약 관리 및 추가">
                  <strong>{medicationTitle}</strong>
                  <ChevronRight />
                </Link>
              </div>
              <div className="saved-medication-list">
                {medications.map((medication) => {
                  const intake = selectedIntakeByMedication.get(medication.id);
                  const isTaken = Boolean(intake);
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
                      <div className="home-medication-image">
                        <Image src={medication.imagePath} alt="" fill sizes="64px" />
                      </div>
                      <div className="home-medication-copy">
                        <strong>{medicationLabel(medication)}</strong>
                        <div className="home-medication-schedule">
                          <div className="home-medication-time">
                            <span>{intake ? formatRecordTime(intake.recordedAt) : "복용시간"}</span>
                            <i aria-hidden="true" />
                            <span>1정</span>
                          </div>
                          <span className={`home-medication-status ${isTaken ? "complete" : ""}`}>
                            {isTaken ? "복용 완료" : "아직 복용하지 않았어요"}
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
                {showDateEyebrow && <span className="card-date-eyebrow">{formatDateEyebrow(selectedDate)}</span>}
                <div className="home-card-title">
                  <strong>오늘의 감정</strong>
                  <ChevronRight />
                </div>
              </div>
              <div className="recorded-mood-item">
                <Image src="/icons/mood-good.png" alt="" width={64} height={64} />
                <strong>{moodRecord.moodLabel}</strong>
                <span>{formatRecordTime(moodRecord.recordedAt)} 기록</span>
              </div>
              <div className="mood-diary-card">
                <div className="mood-diary-title">
                  <Image src="/icons/mood-diary.svg" alt="" width={20} height={20} />
                  <strong>오늘의 일기</strong>
                </div>
                <ul>
                  {(moodRecord.diaryEntries?.length ? moodRecord.diaryEntries : DEFAULT_DIARY_ENTRIES).map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className={`home-card mood-card date-aware-mood-card ${showDateEyebrow ? "with-date" : ""}`}>
              <div className="home-card-copy">
                {showDateEyebrow && <span className="card-date-eyebrow">{formatDateEyebrow(selectedDate)}</span>}
                <strong>{moodEmptyTitle}</strong>
                <p>아직 기록하지 않았어요.</p>
              </div>
              <button type="button">감정 기록하기</button>
            </div>
          )}
        </section>
      </section>

      <footer className="home-footer">
        <div className="footer-links">
          <span>서비스이용약관</span>
          <i />
          <span>개인정보처리방침</span>
        </div>
        <Image src="/brand/addi-footer.svg" alt="아디" width={64} height={24} />
        <p>Copyright ⓒ Kalummy ALL RIGHTS RESERVED.</p>
      </footer>

      <nav className="bottom-nav" aria-label="주요 메뉴">
        <Link href="/" className="active"><span className="nav-icon"><Image className="nav-home-icon" src="/icons/nav-home.svg" alt="" width={23} height={23} /></span>홈</Link>
        <button type="button"><span className="nav-icon"><Image className="nav-heart-icon" src="/icons/nav-heart.svg" alt="" width={23} height={19} /></span>감정기록</button>
        <button type="button"><span className="nav-icon"><Image className="nav-settings-icon" src="/icons/nav-settings.svg" alt="" width={24} height={24} /></span>설정</button>
      </nav>
    </MobileShell>
  );
}
