"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { FlowHeader } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import {
  startMedicationAddAttempt,
  trackMedicationDeleteConfirmed,
  trackMedicationScheduleEditOpened,
} from "@/lib/analytics/events";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { KST_TIME_ZONE, getKstDateKey, isValidDateKey } from "@/lib/kst-date";
import {
  MEDICATION_FALLBACK_IMAGE,
  medicationLabel,
  medicationScheduleLabel,
} from "@/lib/medication-utils";
import { getDataRepositories } from "@/lib/repositories";
import { resetDraft } from "@/lib/registration-session";
import type { MedicationIntakeRecord, SavedMedication } from "@/lib/types";

type DeleteTarget = {
  medication: SavedMedication;
  hasIntakeHistory: boolean;
};

function formatMedicationRecordTime(iso: string) {
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

function MedicationListImage({ medication }: { medication: SavedMedication }) {
  const productImage = medication.productImage?.trim();
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const hasProductImage = Boolean(productImage && medication.imageType !== "fallback");
  const candidates = [
    ...(hasProductImage ? [productImage!] : []),
    medication.fallbackImage,
    medication.imagePath,
    MEDICATION_FALLBACK_IMAGE,
  ].filter((source, index, values): source is string => (
    Boolean(source) && values.indexOf(source) === index
  ));
  const source = candidates.find((candidate) => !failedSources.has(candidate))
    ?? MEDICATION_FALLBACK_IMAGE;
  const isFallback = source !== productImage;

  useEffect(() => setFailedSources(new Set()), [
    medication.fallbackImage,
    medication.imagePath,
    productImage,
  ]);

  return (
    <div className={`medication-list-image ${isFallback ? "fallback" : ""}`}>
      <Image
        src={source}
        alt=""
        fill
        sizes="64px"
        unoptimized={isFallback}
        onError={() => setFailedSources((current) => new Set(current).add(source))}
      />
    </div>
  );
}

function MedicationListContent() {
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date") ?? undefined;
  const targetDate = isValidDateKey(requestedDate) ? requestedDate : getKstDateKey();
  const [medications, setMedications] = useState<SavedMedication[]>([]);
  const [targetDateIntakes, setTargetDateIntakes] = useState<MedicationIntakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const repositories = await getDataRepositories();
      const [savedMedications, intakes] = await Promise.all([
        repositories.medications.listActive(),
        repositories.medicationIntakes.listByDate(targetDate),
      ]);
      setMedications(savedMedications);
      setTargetDateIntakes(intakes);
      void enrichOfficialMedications(savedMedications).then((enrichedMedications) => {
        const enrichedById = new Map(
          enrichedMedications.map((medication) => [medication.id, medication]),
        );
        setMedications((current) => current.map(
          (medication) => enrichedById.get(medication.id) ?? medication,
        ));
      });
    } catch {
      setMedications([]);
      setTargetDateIntakes([]);
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestDelete(medication: SavedMedication) {
    try {
      const repositories = await getDataRepositories();
      const hasIntakeHistory = await repositories.medicationIntakes.hasHistory(medication.id);
      setDeleteTarget({ medication, hasIntakeHistory });
    } catch {
      // Figma does not define an error state for history lookup.
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      const repositories = await getDataRepositories();
      await repositories.medications.deactivate(deleteTarget.medication.id);
      trackMedicationDeleteConfirmed(deleteTarget.hasIntakeHistory);
      setMedications((current) => current.filter(({ id }) => id !== deleteTarget.medication.id));
      setDeleteTarget(null);
    } catch {
      // Figma does not define an error state for deletion failure.
    } finally {
      setDeleting(false);
    }
  }

  const intakeByMedication = new Map(
    targetDateIntakes.map((intake) => [intake.medicationId, intake]),
  );

  return (
    <MobileShell className="flow-screen medication-list-screen">
      <FlowHeader
        title="복용약 목록"
        fallbackHref={`/?date=${encodeURIComponent(targetDate)}`}
      />
      <section className="medication-list-content">
        {!loading ? medications.map((medication) => {
          const intake = intakeByMedication.get(medication.id);
          return (
            <article className="medication-list-item" key={medication.id}>
              <div className="medication-list-main">
                <MedicationListImage medication={medication} />
                <div className="medication-list-item-copy">
                  <strong>{medicationLabel(medication)}</strong>
                  <div className="medication-list-schedule">
                    <span>{medicationScheduleLabel(medication.schedule)}</span>
                    <i aria-hidden="true" />
                    <span>1정</span>
                  </div>
                  <span className={`medication-list-status ${intake ? "complete" : ""}`}>
                    {intake
                      ? `복용 완료 (${formatMedicationRecordTime(intake.recordedAt)})`
                      : "아직 복용하지 않았어요"}
                  </span>
                </div>
                <button
                  type="button"
                  className="medication-list-delete"
                  aria-label={`${medicationLabel(medication)} 삭제`}
                  onClick={() => void requestDelete(medication)}
                >
                  <Image src="/icons/trash-outline.svg" alt="" width={18} height={18} />
                </button>
              </div>
              <div className="medication-list-edit-container">
                <Link
                  className="medication-list-edit-link"
                  href={`/medications/${encodeURIComponent(medication.id)}/schedule?date=${encodeURIComponent(targetDate)}`}
                  onNavigate={() => trackMedicationScheduleEditOpened(
                    medication.schedule,
                    Boolean(medication.scheduledTime),
                  )}
                >
                  복용 시간 수정
                </Link>
              </div>
            </article>
          );
        }) : null}
      </section>

      {!loading ? (
        <div className="bottom-actions medication-list-actions">
          <div className="bottom-actions-inner">
            <Link
              href={`/medications/new/search?origin=medications&date=${encodeURIComponent(targetDate)}`}
              className="primary-button soft medication-add-link"
              onClick={() => {
                resetDraft();
                startMedicationAddAttempt("medication_management");
              }}
            >
              다른 약 추가
            </Link>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="medication-delete-layer" role="presentation">
          <section
            className="medication-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="medication-delete-title"
            aria-describedby="medication-delete-description"
          >
            <header>
              <h2 id="medication-delete-title">
                {medicationLabel(deleteTarget.medication)}을 삭제할까요?
              </h2>
            </header>
            <p id="medication-delete-description">
              {deleteTarget.hasIntakeHistory
                ? "이미 저장된 복용기록은 지워지지 않아요."
                : "삭제하면 다시 약을 등록해야해요."}
            </p>
            <div className="medication-delete-actions">
              <button
                type="button"
                className="cancel"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
              >
                취소
              </button>
              <button
                type="button"
                className="delete"
                onClick={() => void confirmDelete()}
                disabled={deleting}
              >
                삭제
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}

export default function MedicationListPage() {
  return (
    <Suspense fallback={(
      <MobileShell className="flow-screen medication-list-screen">{null}</MobileShell>
    )}>
      <MedicationListContent />
    </Suspense>
  );
}
