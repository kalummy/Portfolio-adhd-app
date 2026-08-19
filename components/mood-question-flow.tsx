"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { MoodResult } from "@/components/mood-result";
import { MoodSummaryLoading } from "@/components/mood-summary-loading";
import { VisitDialog } from "@/components/visit-dialog";
import { saveMoodRecord } from "@/lib/indexed-db";
import {
  buildMoodSummary,
  CUSTOM_MOOD_OPTION_ID,
  type MoodAnswerDraft,
  type MoodResultData,
} from "@/lib/mood-summary";

const SUMMARY_DURATION_MS = 6000;

const MOOD_QUESTIONS = [
  {
    eyebrow: "감정상태",
    title: ["지금 기분은 어떤가요?", "해당되는 항목을 모두 선택해주세요"],
    options: [
      { id: "good", label: "기분이 좋아요" },
      { id: "same", label: "평소와 똑같아요" },
      { id: "lethargic", label: "무기력해요" },
      { id: "depressed-irritable", label: "우울하거나 예민해요" },
    ],
  },
  {
    eyebrow: "약효 체감",
    title: ["약을 먹고 어떤 변화가 있었나요?"],
    options: [
      { id: "focused", label: "집중이 잘 됐어요" },
      { id: "too-strong", label: "약이 좀 센 것 같아요" },
      { id: "no-effect", label: "큰 효과를 느끼지 못했어요" },
      { id: "wore-off-early", label: "오후에 약 효과가 빨리 내려갔어요" },
    ],
  },
  {
    eyebrow: "부작용",
    title: ["불편했던 증상이 있었다면", "모두 선택해주세요"],
    options: [
      { id: "low-appetite", label: "식욕이 줄었어요" },
      { id: "headache", label: "두통이 있었어요" },
      { id: "chest-pain", label: "가슴 통증이 있었어요" },
      { id: "none", label: "특별한 부작용은 없었어요" },
    ],
  },
  {
    eyebrow: "피로도 확인",
    title: ["오늘의 컨디션을 체크해주세요"],
    options: [
      { id: "trouble-sleeping", label: "잠들기 어려웠어요" },
      { id: "tired", label: "피곤했어요" },
      { id: "anxious", label: "긴장되거나 초조했어요" },
      { id: "same", label: "평소와 똑같았어요" },
    ],
  },
] as const;

function createEmptyAnswers(): MoodAnswerDraft[] {
  return MOOD_QUESTIONS.map(() => ({
  selected: [],
  customText: "",
  }));
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function MoodQuestionFlow() {
  const [phase, setPhase] = useState<"questions" | "summarizing" | "result">("questions");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<MoodAnswerDraft[]>(createEmptyAnswers);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const [resultDialog, setResultDialog] = useState<"restart" | "exit" | null>(null);
  const [result, setResult] = useState<MoodResultData | null>(null);
  const [saving, setSaving] = useState(false);
  const question = MOOD_QUESTIONS[step];
  const answer = answers[step];
  const customSelected = answer.selected.includes(CUSTOM_MOOD_OPTION_ID);
  const hasStandardSelection = answer.selected.some((id) => id !== CUSTOM_MOOD_OPTION_ID);
  const canContinue = hasStandardSelection || (customSelected && answer.customText.trim().length > 0);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [phase, step]);

  useEffect(() => {
    if (phase !== "summarizing" || !result) return;
    const timeout = window.setTimeout(() => setPhase("result"), SUMMARY_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [phase, result]);

  function toggleOption(optionId: string) {
    setAnswers((current) => current.map((item, index) => {
      if (index !== step) return item;
      const selected = item.selected.includes(optionId)
        ? item.selected.filter((id) => id !== optionId)
        : [...item.selected, optionId];
      return { ...item, selected };
    }));
  }

  function updateCustomText(customText: string) {
    setAnswers((current) => current.map((item, index) => (
      index === step ? { ...item, customText } : item
    )));
  }

  function goToNextStep() {
    if (!canContinue) return;
    if (step === MOOD_QUESTIONS.length - 1) {
      const nextResult = buildMoodSummary(answers, new Date().toISOString());
      setResult(nextResult);
      setPhase("summarizing");
      return;
    }
    setStep((current) => current + 1);
  }

  function restartQuestions() {
    setAnswers(createEmptyAnswers());
    setStep(0);
    setResult(null);
    setResultDialog(null);
    setPhase("questions");
  }

  async function saveResult() {
    if (!result || saving) return;
    setSaving(true);
    try {
      const recordedDate = new Date(result.recordedAt);
      await saveMoodRecord({
        date: toLocalDateKey(recordedDate),
        mood: result.moodType,
        moodLabel: result.label,
        recordedAt: result.recordedAt,
        diaryEntries: result.summaryItems,
      });
      window.location.assign("/?moodToast=saved");
    } finally {
      setSaving(false);
    }
  }

  if (phase === "summarizing") {
    return <MoodSummaryLoading />;
  }

  if (phase === "result" && result) {
    return (
      <MoodResult
        result={result}
        dialog={resultDialog}
        saving={saving}
        onBack={() => setResultDialog("exit")}
        onCancelDialog={() => setResultDialog(null)}
        onConfirmExit={() => window.location.assign("/")}
        onConfirmRestart={restartQuestions}
        onRestart={() => setResultDialog("restart")}
        onSave={() => void saveResult()}
      />
    );
  }

  return (
    <MobileShell className="flow-screen mood-question-screen">
      <FlowHeader
        title="감정 기록하기"
        beforeBack={() => setShowExitDialog(true)}
        onBackOnly
      />

      <section className="mood-question-heading">
        <p>{question.eyebrow}</p>
        <h1>
          {question.title.map((line) => <span key={line}>{line}</span>)}
        </h1>
      </section>

      <fieldset className="mood-question-options">
        <legend className="visually-hidden">{question.title.join(" ")}</legend>
        {question.options.map((option) => {
          const selected = answer.selected.includes(option.id);
          return (
            <label className={`mood-question-option ${selected ? "selected" : ""}`} key={option.id}>
              <input
                className="mood-question-native-checkbox"
                type="checkbox"
                checked={selected}
                onChange={() => toggleOption(option.id)}
              />
              <Image
                src={selected ? "/icons/checkbox-checked.svg" : "/icons/checkbox-unchecked.svg"}
                alt=""
                width={20}
                height={20}
              />
              <span>{option.label}</span>
            </label>
          );
        })}

        <div className={`mood-question-option custom ${customSelected ? "selected" : ""}`}>
          <label className="mood-question-custom-toggle">
            <input
              className="mood-question-native-checkbox"
              type="checkbox"
              checked={customSelected}
              onChange={() => toggleOption(CUSTOM_MOOD_OPTION_ID)}
            />
            <Image
              src={customSelected ? "/icons/checkbox-checked.svg" : "/icons/checkbox-unchecked.svg"}
              alt=""
              width={20}
              height={20}
            />
            <span>직접 입력할게요</span>
          </label>
          <input
            className="mood-question-custom-input"
            type="text"
            value={answer.customText}
            placeholder="내용을 입력해주세요."
            aria-label={`${question.eyebrow} 직접 입력`}
            disabled={!customSelected}
            onChange={(event) => updateCustomText(event.target.value)}
          />
        </div>
      </fieldset>

      <BottomActions>
        <PrimaryButton
          type="button"
          disabled={!canContinue}
          onClick={goToNextStep}
        >
          다음 ({step + 1}/4)
        </PrimaryButton>
      </BottomActions>

      {showExitDialog ? (
        <VisitDialog
          title="감정 기록을 중단할까요?"
          cancelLabel="취소"
          confirmLabel="중단하기"
          onCancel={() => setShowExitDialog(false)}
          onConfirm={() => window.location.assign("/")}
        />
      ) : null}
    </MobileShell>
  );
}
