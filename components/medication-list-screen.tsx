"use client";

import Image from "next/image";
import { createClientId } from "@/lib/client-id";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FlowHeader } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import {
  startMedicationAddAttempt,
  trackMedicationDeleteConfirmed,
  trackMedicationScheduleEditOpened,
} from "@/lib/analytics/events";
import { enrichOfficialMedications } from "@/lib/medication-enrichment";
import { resolveMedicationImage } from "@/lib/medication-images";
import { getHomeMedicationProjection } from "@/lib/home-medication-projection";
import { KST_TIME_ZONE, getKstDateKey, isValidDateKey } from "@/lib/kst-date";
import {
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
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const label = medicationLabel(medication);
  const existingImage = medication.productImage ?? medication.imagePath;
  const image = resolveMedicationImage({
    medicationId: medication.catalogId,
    medicationName: label,
    existingImage,
    fallbackImage: medication.fallbackImage ?? medication.imagePath,
    failedSources,
  });

  useEffect(() => setFailedSources(new Set()), [
    medication.fallbackImage,
    medication.imagePath,
    medication.catalogId,
    medication.productImage,
    label,
  ]);

  return (
    <div className={`medication-list-image ${image.type === "fallback" ? "fallback" : ""}`}>
      <Image
        src={image.src}
        alt=""
        fill
        sizes="64px"
        unoptimized={image.type === "fallback"}
        onError={() => setFailedSources((current) => new Set(current).add(image.src))}
      />
    </div>
  );
}

export function MedicationListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDate = searchParams.get("date") ?? undefined;
  const targetDate = isValidDateKey(requestedDate) ? requestedDate : getKstDateKey();
  const [medications, setMedications] = useState<SavedMedication[]>([]);
  const [targetDateIntakes, setTargetDateIntakes] = useState<MedicationIntakeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
    try {
      const repositories = await getDataRepositories();
      const deleted = await repositories.medications.deactivate(deleteTarget.medication.id);
      if (deleted.id !== deleteTarget.medication.id || deleted.active) throw new Error("medication_delete_unconfirmed");
      trackMedicationDeleteConfirmed(deleteTarget.hasIntakeHistory);
      router.replace(`/?date=${encodeURIComponent(targetDate)}&medicationToast=deleted&toastId=${createClientId()}`);
    } catch {
      setError("삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  const intakeByMedication = new Map(
    targetDateIntakes.map((intake) => [intake.medicationId, intake]),
  );
  const displayedMedications = getHomeMedicationProjection({
    medications,
    intakeRecords: targetDateIntakes,
    selectedDate: targetDate,
    todayDate: getKstDateKey(),
  });

  return (
    <MobileShell className="flow-screen medication-list-screen">
      <FlowHeader
        title="복용약 목록"
        fallbackHref={`/?date=${encodeURIComponent(targetDate)}`}
      />
      <section className="medication-list-content">
        {error ? <p className="save-error" role="alert">{error}</p> : null}
        {!loading ? displayedMedications.map((medication) => {
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
              {intake ? (
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
              ) : null}
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
                startMedicationAddAttempt("medication_management", targetDate);
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
