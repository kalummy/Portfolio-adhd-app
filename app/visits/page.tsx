"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FlowHeader } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { Toast } from "@/components/toast";
import { VisitDialog } from "@/components/visit-dialog";
import { deleteUpcomingVisit, getUpcomingVisit } from "@/lib/indexed-db";
import { formatVisitDate, formatVisitDday } from "@/lib/visit-date";
import type { VisitSchedule } from "@/lib/types";

function VisitListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visit, setVisit] = useState<VisitSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const queryToast = searchParams.get("visitToast") === "updated"
    ? "내원일정을 수정했어요."
    : "";

  const load = useCallback(async () => {
    try {
      const savedVisit = await getUpcomingVisit();
      if (!savedVisit) {
        router.replace("/");
        return;
      }
      setVisit(savedVisit);
      setError("");
    } catch {
      setError("내원일정을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!queryToast) return;
    setToast(queryToast);
    const timeout = window.setTimeout(() => {
      window.history.replaceState(window.history.state, "", "/visits");
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [queryToast]);

  async function confirmDelete() {
    if (deleting) return;
    setDeleting(true);
    setError("");
    try {
      await deleteUpcomingVisit();
      router.replace("/?visitToast=deleted");
    } catch {
      setShowDelete(false);
      setError("내원일정을 삭제하지 못했어요.");
    } finally {
      setDeleting(false);
    }
  }

  const dday = visit ? formatVisitDday(visit.visitDate) : null;

  return (
    <MobileShell className="flow-screen visit-list-screen">
      <FlowHeader title="내원일정" fallbackHref="/" />
      <section className="visit-list-content">
        <div className="visit-list-title">
          <h1>내원일정을 확인해주세요</h1>
          <p>내원일정을 수정하거나 삭제할 수 있어요.</p>
        </div>

        {!loading && visit ? (
          <section className="upcoming-visit" aria-labelledby="upcoming-visit-title">
            <h2 id="upcoming-visit-title">다가오는 일정</h2>
            <article className="visit-card">
              <div className="visit-card-date">
                <strong>{formatVisitDate(visit.visitDate)}</strong>
                {dday ? <span>{dday}</span> : null}
              </div>
              <div className="visit-card-actions">
                <button type="button" onClick={() => router.push("/visits/edit")}>수정</button>
                <button type="button" onClick={() => setShowDelete(true)}>삭제</button>
              </div>
            </article>
          </section>
        ) : null}

        {loading ? <div className="visit-list-loading" aria-label="내원일정 불러오는 중" /> : null}
        {error ? <p className="visit-error" role="alert">{error}</p> : null}
      </section>

      {showDelete ? (
        <VisitDialog
          title="내원일정을 삭제할까요?"
          cancelLabel="취소"
          confirmLabel="삭제하기"
          onCancel={() => setShowDelete(false)}
          onConfirm={() => void confirmDelete()}
          busy={deleting}
        />
      ) : null}

      {toast ? (
        <Toast
          message={toast}
          onDismiss={() => setToast("")}
        />
      ) : null}
    </MobileShell>
  );
}

export default function VisitListPage() {
  return (
    <Suspense fallback={<MobileShell className="flow-screen visit-list-screen">{null}</MobileShell>}>
      <VisitListContent />
    </Suspense>
  );
}
