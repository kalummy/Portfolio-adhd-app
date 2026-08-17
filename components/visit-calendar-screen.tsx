"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { VisitCalendar } from "@/components/visit-calendar";
import { VisitDialog } from "@/components/visit-dialog";
import { getUpcomingVisit, saveUpcomingVisit } from "@/lib/indexed-db";
import { formatVisitDate } from "@/lib/visit-date";

type VisitCalendarScreenProps = {
  mode: "new" | "edit";
};

export function VisitCalendarScreen({ mode }: VisitCalendarScreenProps) {
  const router = useRouter();
  const [initialDate, setInitialDate] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(mode === "edit");
  const [dialog, setDialog] = useState<"confirm" | "discard" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode !== "edit") return;
    let active = true;
    void getUpcomingVisit()
      .then((visit) => {
        if (!active) return;
        if (!visit) {
          router.replace("/");
          return;
        }
        setInitialDate(visit.visitDate);
        setSelectedDate(visit.visitDate);
      })
      .catch(() => {
        if (active) setError("내원일정을 불러오지 못했어요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [mode, router]);

  const isDirty = selectedDate !== null && selectedDate !== initialDate;
  const canSubmit = mode === "new" ? selectedDate !== null : isDirty;

  const handleBack = useCallback(() => {
    if (mode === "edit" && isDirty) {
      setDialog("discard");
      return;
    }
    router.replace(mode === "edit" ? "/visits" : "/");
  }, [isDirty, mode, router]);

  async function confirmSave() {
    if (!selectedDate || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveUpcomingVisit(selectedDate);
      router.replace(mode === "new" ? "/?visitToast=added" : "/visits?visitToast=updated");
    } catch {
      setDialog(null);
      setError(mode === "new" ? "내원일정을 추가하지 못했어요." : "내원일정을 수정하지 못했어요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <MobileShell className="flow-screen visit-calendar-screen">
      <FlowHeader
        title={mode === "new" ? "내원일 추가하기" : "내원일 수정하기"}
        beforeBack={handleBack}
        onBackOnly
      />
      <section className="visit-calendar-content">
        <h1>다음 내원일을 선택해주세요</h1>
        {loading ? (
          <div className="visit-calendar-loading" aria-label="내원일정 불러오는 중" />
        ) : (
          <VisitCalendar selectedDate={selectedDate} onSelect={setSelectedDate} />
        )}
        {error ? <p className="visit-error" role="alert">{error}</p> : null}
      </section>

      <BottomActions>
        <PrimaryButton
          type="button"
          variant="soft"
          disabled={!canSubmit || saving}
          onClick={() => setDialog("confirm")}
        >
          {mode === "new" ? "추가하기" : "수정하기"}
        </PrimaryButton>
      </BottomActions>

      {dialog === "confirm" && selectedDate ? (
        <VisitDialog
          title={<>다음 내원일은<br />{formatVisitDate(selectedDate)} 입니다.</>}
          cancelLabel="취소"
          confirmLabel="확인"
          onCancel={() => setDialog(null)}
          onConfirm={() => void confirmSave()}
          busy={saving}
        />
      ) : null}

      {dialog === "discard" ? (
        <VisitDialog
          title="내원일 수정을 취소할까요?"
          cancelLabel="닫기"
          confirmLabel="취소하기"
          onCancel={() => setDialog(null)}
          onConfirm={() => router.replace("/visits")}
        />
      ) : null}
    </MobileShell>
  );
}
