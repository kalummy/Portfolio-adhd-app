"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/mobile-shell";
import { MOOD_DELETED_TOAST_STORAGE_KEY } from "@/components/mood-history";
import { formatMoodRecordDate, formatMoodRecordDateTime } from "@/lib/mood-history";
import { getMoodRecordDisplayCat } from "@/lib/mood-record-cat";
import { getMoodRepository } from "@/lib/repositories";
import type { MoodRecord } from "@/lib/types";

function getDetailCat(record: MoodRecord) {
  return getMoodRecordDisplayCat(record.catId);
}

function getStoredEmotionItems(record: MoodRecord) {
  const analyzed = record.analysisResult?.todayEmotion
    .map((item) => item.text.trim())
    .filter(Boolean);
  if (analyzed?.length) return analyzed;

  const legacy = record.diaryEntries?.map((item) => item.trim()).filter(Boolean);
  if (legacy?.length) return legacy;
  return record.memberSummary?.trim() ? [record.memberSummary.trim()] : [];
}

function getStoredClinicPhrase(record: MoodRecord) {
  return record.analysisResult?.clinicPhrase.text.trim()
    || record.clinicPhrase?.trim()
    || record.memberSummary?.trim()
    || record.diaryEntries?.[0]?.trim()
    || "";
}

export function MoodRecordDetail({ dateKey }: { dateKey: string }) {
  const router = useRouter();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [record, setRecord] = useState<MoodRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    void getMoodRepository()
      .then((repository) => repository.findByDate(dateKey))
      .then((saved) => {
        if (!active) return;
        if (!saved) {
          router.replace("/moods");
          return;
        }
        setRecord(saved);
      })
      .catch(() => {
        if (active) router.replace("/moods");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [dateKey, router]);

  useEffect(() => {
    if (!deleteOpen) return;
    cancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleting) setDeleteOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deleteOpen, deleting]);

  const emotionItems = useMemo(
    () => record ? getStoredEmotionItems(record) : [],
    [record],
  );
  const clinicPhrase = useMemo(
    () => record ? getStoredClinicPhrase(record) : "",
    [record],
  );

  async function confirmDelete() {
    if (!record || deleting) return;
    setDeleting(true);
    try {
      const repository = await getMoodRepository();
      await repository.deleteByDate(record.date);
      try {
        window.sessionStorage.setItem(
          MOOD_DELETED_TOAST_STORAGE_KEY,
          formatMoodRecordDate(record.date),
        );
      } catch {
        // Navigation and deletion do not depend on transient toast storage.
      }
      router.replace("/moods?deleted=1");
    } finally {
      setDeleting(false);
    }
  }

  if (loading || !record) {
    return <MobileShell className="mood-record-detail-screen">{null}</MobileShell>;
  }

  const cat = getDetailCat(record);

  return (
    <MobileShell className="mood-record-detail-screen">
      <header className="mood-record-detail-header">
        <Link href="/moods" className="icon-button" aria-label="기록순으로 돌아가기">
          <Image src="/icons/back.svg" alt="" width={18} height={14} />
        </Link>
      </header>

      <section className="mood-record-detail-hero">
        <div className="mood-record-detail-info">
          <span>{formatMoodRecordDateTime(record)}</span>
          <strong>{record.moodLabel || record.memberSummary}</strong>
        </div>
        <span className={`mood-record-detail-cat cat-${cat.id}`}>
          <Image src={cat.imagePath} alt={cat.displayName} fill sizes="160px" priority />
        </span>
      </section>

      <section className="mood-record-detail-cards">
        <article className="mood-record-emotion-card">
          <h1>
            <Image src="/icons/mood-summary-sparkle.svg" alt="" width={20} height={20} />
            오늘 내 감정
          </h1>
          <ul>
            {emotionItems.map((item, index) => (
              <li key={`${item}-${index}`}><span aria-hidden="true" /><p>{item}</p></li>
            ))}
          </ul>
        </article>
        <article className="mood-record-clinic-card">
          <h1>
            <Image src="/icons/mood-summary-sparkle.svg" alt="" width={20} height={20} />
            병원에서 이렇게 이야기 해보세요
          </h1>
          <p>“{clinicPhrase}”</p>
        </article>
      </section>

      <footer className="mood-record-detail-footer">
        <button type="button" onClick={() => setDeleteOpen(true)}>기록 삭제</button>
      </footer>

      {deleteOpen ? (
        <div className="mood-record-delete-layer" role="presentation">
          <div className="mood-record-delete-dim" />
          <section
            className="mood-record-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mood-record-delete-title"
            aria-describedby="mood-record-delete-description"
          >
            <h2 id="mood-record-delete-title">
              <span>{formatMoodRecordDate(record.date)}</span>
              <span>기록을 삭제할까요?</span>
            </h2>
            <p id="mood-record-delete-description">삭제하면 리포트 결과가 달라져요.</p>
            <div>
              <button
                ref={cancelButtonRef}
                type="button"
                className="cancel"
                disabled={deleting}
                onClick={() => setDeleteOpen(false)}
              >
                취소
              </button>
              <button type="button" className="confirm" disabled={deleting} onClick={confirmDelete}>
                삭제
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
