"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { MoodResult } from "@/components/mood-result";
import { MoodSummaryLoading } from "@/components/mood-summary-loading";
import { VisitDialog } from "@/components/visit-dialog";
import {
  ensureMoodAttempt, restartMoodAttempt, trackMoodResultViewed, trackMoodSaved, trackMoodStepCompleted,
} from "@/lib/analytics/events";
import { createClientId } from "@/lib/client-id";
import { getMoodRepository } from "@/lib/repositories";
import {
  buildMoodSummary, CUSTOM_MOOD_OPTION_ID, type MoodAnswerDraft, type MoodResultData,
} from "@/lib/mood-summary";

const TIMED_EFFECT_IDS = new Set(["weak", "strong"]);
const TIMING_OPTIONS = ["아침", "점심", "저녁"];

const MOOD_QUESTIONS = [
  {
    title: "오늘 약 효과는 어땠나요?",
    subtitle: "전반적인 약 효과 느낌을 선택해주세요. (복수선택 가능)",
    options: [
      { id: "effective", label: "약 효과를 잘 느꼈어요" },
      { id: "similar", label: "평소와 비슷해요" },
      { id: "weak", label: "효과가 약했어요" },
      { id: "strong", label: "약이 너무 강하게 느껴졌어요" },
    ],
  },
  {
    title: "오늘 감정 기복은 어땠나요?",
    subtitle: "전반적인 감정 상태를 모두 선택해주세요. (복수선택)",
    grid: true,
    options: [
      { id: "anxious", label: "불안" }, { id: "irritable", label: "예민" },
      { id: "depressed", label: "우울" }, { id: "lethargic", label: "무기력" },
      { id: "hyperfocus", label: "과몰입" }, { id: "impulsive", label: "충동성" },
      { id: "sleep", label: "수면 문제" }, { id: "appetite", label: "식욕 변화" },
      { id: "palpitation", label: "두근 거림" }, { id: "headache", label: "두통" },
    ],
  },
  {
    title: "오늘 사람들과의 관계는 어땠나요?",
    subtitle: "가장 가까운 항목을 선택해주세요.",
    options: [
      { id: "task", label: "업무, 과제 집중이 어려웠어요" },
      { id: "conversation", label: "사람들과의 대화에 집중이 안되고 힘들었어요" },
      { id: "unfinished", label: "할일을 모두 끝내지 못했어요" },
      { id: "none", label: "특별한 문제는 없었어요" },
    ],
  },
] as const;

function emptyAnswers(): MoodAnswerDraft[] {
  return MOOD_QUESTIONS.map(() => ({ selected: [], customText: "", timingsByOption: {} }));
}

type MoodQuestionFlowProps = {
  targetDateKey: string;
  lottieAvailability: { complete: boolean };
};

export function MoodQuestionFlow({ targetDateKey, lottieAvailability }: MoodQuestionFlowProps) {
  const [phase, setPhase] = useState<"questions" | "summarizing" | "result">("questions");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<MoodAnswerDraft[]>(emptyAnswers);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [result, setResult] = useState<MoodResultData | null>(null);
  const [loadingAnimationComplete, setLoadingAnimationComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const question = MOOD_QUESTIONS[step];
  const answer = answers[step];
  const customSelected = answer.selected.includes(CUSTOM_MOOD_OPTION_ID);
  const canContinue = answer.selected.some((id) => id !== CUSTOM_MOOD_OPTION_ID)
    || (customSelected && answer.customText.trim().length > 0);
  const homeHref = `/?date=${encodeURIComponent(targetDateKey)}`;

  useEffect(() => { ensureMoodAttempt("home"); }, []);

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, moodStep: 0, moodPhase: "questions" }, "");
    const onPopState = (event: PopStateEvent) => {
      const historyStep = Number(event.state?.moodStep);
      if (Number.isInteger(historyStep) && historyStep >= 0 && historyStep < MOOD_QUESTIONS.length) {
        setStep(historyStep);
        if (event.state?.moodPhase === "questions") {
          setPhase("questions");
          setResult(null);
          setLoadingAnimationComplete(false);
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [phase, step]);

  useEffect(() => {
    if (phase !== "summarizing" || result) return;
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      if (!active) return;
      const nextResult = buildMoodSummary(answers, new Date().toISOString());
      setResult(nextResult);
    });
    return () => { active = false; window.cancelAnimationFrame(frame); };
  }, [answers, phase, result]);

  useEffect(() => {
    if (phase !== "summarizing" || !result || !loadingAnimationComplete) return;
    setPhase("result");
    window.history.replaceState({ ...window.history.state, moodStep: 2, moodPhase: "result" }, "");
  }, [loadingAnimationComplete, phase, result]);

  useEffect(() => { if (phase === "result" && result) trackMoodResultViewed(); }, [phase, result]);

  function updateAnswer(update: (current: MoodAnswerDraft) => MoodAnswerDraft) {
    setAnswers((current) => current.map((item, index) => index === step ? update(item) : item));
  }

  function toggleOption(optionId: string) {
    updateAnswer((item) => ({
      ...item,
      selected: item.selected.includes(optionId) ? item.selected.filter((id) => id !== optionId) : [...item.selected, optionId],
    }));
  }

  function toggleTiming(optionId: string, timing: string) {
    updateAnswer((item) => {
      const current = item.timingsByOption?.[optionId] ?? [];
      const next = current.includes(timing) ? current.filter((value) => value !== timing) : [...current, timing];
      return { ...item, timingsByOption: { ...item.timingsByOption, [optionId]: next } };
    });
  }

  function goBack() {
    if (step > 0) window.history.back();
    else window.location.assign(homeHref);
  }

  function goToNextStep() {
    if (!canContinue) return;
    trackMoodStepCompleted((step + 1) as 1 | 2 | 3);
    if (step === MOOD_QUESTIONS.length - 1) {
      setResult(null);
      setLoadingAnimationComplete(false);
      window.history.pushState({ ...window.history.state, moodStep: 2, moodPhase: "summarizing" }, "");
      setPhase("summarizing");
      return;
    }
    const nextStep = step + 1;
    window.history.pushState({ ...window.history.state, moodStep: nextStep, moodPhase: "questions" }, "");
    setStep(nextStep);
  }

  function restartQuestions() {
    restartMoodAttempt();
    setAnswers(emptyAnswers()); setStep(0); setResult(null); setLoadingAnimationComplete(false); setPhase("questions");
    window.history.replaceState({ ...window.history.state, moodStep: 0, moodPhase: "questions" }, "");
  }

  async function saveResult() {
    if (!result || saving) return;
    setSaving(true);
    try {
      const repository = await getMoodRepository();
      await repository.save({
        date: targetDateKey, mood: result.moodType, moodLabel: result.label, recordedAt: result.recordedAt,
        diaryEntries: result.checkItems, memberSummary: result.memberSummary, clinicPhrase: result.clinicPhrase, details: result.details,
      });
      await trackMoodSaved();
      const destination = new URL(homeHref, window.location.origin);
      destination.searchParams.set("moodToast", "saved"); destination.searchParams.set("toastId", createClientId());
      window.location.assign(`${destination.pathname}${destination.search}`);
    } finally { setSaving(false); }
  }

  if (phase === "summarizing") return <MoodSummaryLoading
    showExitDialog={showExitDialog} onAnimationComplete={() => setLoadingAnimationComplete(true)}
    onBack={() => window.history.back()} onClose={() => setShowExitDialog(true)}
    onCancelExit={() => setShowExitDialog(false)} onConfirmExit={() => window.location.assign(homeHref)} />;
  if (phase === "result" && result) {
    return <MoodResult result={result} hasAnimation={lottieAvailability.complete} saving={saving}
      onRestart={restartQuestions} onSave={() => void saveResult()} />;
  }

  return (
    <MobileShell className="flow-screen mood-question-screen">
      <FlowHeader title="감정 기록하기" onBack={goBack} onClose={() => setShowExitDialog(true)} />
      <div className="mood-progress" aria-label={`${step + 1}/3 단계`}>
        {MOOD_QUESTIONS.map((item, index) => <span className={index === step ? "active" : ""} key={item.title} />)}
      </div>
      <section className="mood-question-heading"><h1>{question.title}</h1><p>{question.subtitle}</p></section>

      <fieldset className={`mood-question-options ${"grid" in question && question.grid ? "two-column" : ""}`}>
        <legend className="visually-hidden">{question.title}</legend>
        {question.options.map((option) => {
          const selected = answer.selected.includes(option.id);
          return (
            <div className={`mood-question-option ${selected ? "selected" : ""}`} key={option.id}>
              <label className="mood-question-option-toggle">
                <input className="mood-question-native-checkbox" type="checkbox" checked={selected} onChange={() => toggleOption(option.id)} />
                <Image src={selected ? "/icons/checkbox-checked.svg" : "/icons/checkbox-unchecked.svg"} alt="" width={20} height={20} />
                <span>{option.label}</span>
              </label>
              {step === 0 && selected && TIMED_EFFECT_IDS.has(option.id) ? (
                <div className="mood-timing-options">
                  <p>언제부터 그렇게 느꼈나요? (선택)</p>
                  {TIMING_OPTIONS.map((timing) => {
                    const timingSelected = answer.timingsByOption?.[option.id]?.includes(timing) ?? false;
                    return <button type="button" className={timingSelected ? "selected" : ""} onClick={() => toggleTiming(option.id, timing)} key={timing}>
                      <span>{timing}</span><span aria-hidden="true">✓</span>
                    </button>;
                  })}
                </div>
              ) : null}
            </div>
          );
        })}

        <div className={`mood-question-option custom ${customSelected ? "selected" : ""}`}>
          <label className="mood-question-option-toggle">
            <input className="mood-question-native-checkbox" type="checkbox" checked={customSelected} onChange={() => toggleOption(CUSTOM_MOOD_OPTION_ID)} />
            <Image src={customSelected ? "/icons/checkbox-checked.svg" : "/icons/checkbox-unchecked.svg"} alt="" width={20} height={20} />
            <span>직접 입력할게요</span>
          </label>
          {customSelected ? <input className="mood-question-custom-input" type="text" value={answer.customText}
            placeholder="내용을 입력해주세요." aria-label={`${question.title} 직접 입력`}
            onChange={(event) => updateAnswer((item) => ({ ...item, customText: event.target.value }))} /> : null}
        </div>
      </fieldset>

      <BottomActions><PrimaryButton type="button" disabled={!canContinue} onClick={goToNextStep}>
        {step === 2 ? "완료" : `다음 (${step + 1}/3)`}
      </PrimaryButton></BottomActions>

      {showExitDialog ? <VisitDialog title="감정 기록을 중단할까요?" cancelLabel="취소" confirmLabel="중단하기"
        onCancel={() => setShowExitDialog(false)} onConfirm={() => window.location.assign(homeHref)} /> : null}
    </MobileShell>
  );
}
