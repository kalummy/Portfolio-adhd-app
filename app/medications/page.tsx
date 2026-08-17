"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlowHeader } from "@/components/flow-ui";
import { MedicationSummaryCard } from "@/components/medication-card";
import { MobileShell } from "@/components/mobile-shell";
import {
  hasMedicationIntakeHistory,
} from "@/lib/indexed-db";
import { getMedicationRepository } from "@/lib/repositories/medications";
import { medicationLabel } from "@/lib/medication-utils";
import { resetDraft } from "@/lib/registration-session";
import type { SavedMedication } from "@/lib/types";

type DeleteTarget = {
  medication: SavedMedication;
  hasIntakeHistory: boolean;
};

export default function MedicationListPage() {
  const router = useRouter();
  const [medications, setMedications] = useState<SavedMedication[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const repository = await getMedicationRepository();
      setMedications(await repository.listActive());
      setError("");
    } catch {
      setError("복용약 목록을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestDelete(medication: SavedMedication) {
    setError("");
    try {
      const hasIntakeHistory = await hasMedicationIntakeHistory(medication.id);
      setDeleteTarget({ medication, hasIntakeHistory });
    } catch {
      setError("복용 기록을 확인하지 못했어요.");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError("");
    try {
      const repository = await getMedicationRepository();
      await repository.deactivate(deleteTarget.medication.id);
      setMedications((current) => current.filter(({ id }) => id !== deleteTarget.medication.id));
      setDeleteTarget(null);
    } catch {
      setError("복용약을 삭제하지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setDeleting(false);
    }
  }

  function startEmptyRegistration(path: "/medications/new/photo" | "/medications/new/search") {
    resetDraft();
    router.push(path);
  }

  return (
    <MobileShell className="flow-screen medication-list-screen">
      <FlowHeader title="복용약 목록" fallbackHref="/" />
      <section className={`medication-list-content ${!loading && medications.length === 0 ? "empty" : ""}`}>
        {loading ? (
          <div className="medication-list-loading" aria-label="복용약 목록 불러오는 중" />
        ) : medications.length === 0 ? (
          <>
            <div className="medication-list-title">
              <h1>현재 등록된 약이 없어요</h1>
              <p>복용하고 있는 ADHD 약을 등록해주세요.</p>
            </div>
            <div className="method-grid medication-empty-methods">
              <button
                type="button"
                className="method-card"
                onClick={() => startEmptyRegistration("/medications/new/photo")}
              >
                <span className="method-icon" aria-hidden="true">
                  <Image src="/icons/camera.svg" alt="" width={32} height={28} />
                </span>
                <strong>처방전/약봉투<br />촬영해서 추가</strong>
              </button>
              <button
                type="button"
                className="method-card"
                onClick={() => startEmptyRegistration("/medications/new/search")}
              >
                <span className="method-icon" aria-hidden="true">
                  <Image src="/icons/search.svg" alt="" width={32} height={29} />
                </span>
                <strong>약 이름을<br />검색해서 추가</strong>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="medication-list-title">
              <h1>현재 등록된 복용약 목록이에요</h1>
              <p>복용약을 추가하거나 삭제할 수 있어요.</p>
            </div>
            <section className="registered-medications" aria-labelledby="registered-medications-title">
              <h2 id="registered-medications-title">현재 등록된 약</h2>
              <div className="registered-medication-list">
                {medications.map((medication) => (
                  <div className="registered-medication-row" key={medication.id}>
                    <MedicationSummaryCard medication={medication} />
                    <button
                      type="button"
                      className="medication-list-delete"
                      aria-label={`${medicationLabel(medication)} 삭제`}
                      onClick={() => void requestDelete(medication)}
                    >
                      <Image src="/icons/trash-outline.svg" alt="" width={18} height={18} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {error ? <p className="medication-list-error" role="alert">{error}</p> : null}
      </section>

      {!loading && medications.length > 0 ? (
        <div className="bottom-actions medication-list-actions">
          <div className="bottom-actions-inner">
            <Link
              href="/medications/new?origin=medications"
              className="primary-button soft medication-add-link"
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
                {deleteTarget.hasIntakeHistory
                  ? "복용 중인 약에서 삭제할까요?"
                  : `${medicationLabel(deleteTarget.medication)}을 삭제할까요?`}
              </h2>
            </header>
            <p id="medication-delete-description">
              {deleteTarget.hasIntakeHistory ? (
                <>이전에 기록한 복용 내역은 그대로 유지돼요.</>
              ) : (
                <>삭제하면 다시 약을 등록해야해요.</>
              )}
            </p>
            <div className="medication-delete-actions">
              <button type="button" className="cancel" onClick={() => setDeleteTarget(null)} disabled={deleting}>
                취소
              </button>
              <button type="button" className="delete" onClick={() => void confirmDelete()} disabled={deleting}>
                삭제
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </MobileShell>
  );
}
