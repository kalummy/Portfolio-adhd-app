"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BottomActions, FlowHeader, PrimaryButton } from "@/components/flow-ui";
import { MobileShell } from "@/components/mobile-shell";
import { MoodResult } from "@/components/mood-result";
import { MoodSummaryLoading } from "@/components/mood-summary-loading";
import { VisitDialog } from "@/components/visit-dialog";
import {
  ensureMoodAttempt,
  trackMoodCatRewardRevealed,
  trackMoodCompleted,
  trackMoodResultViewed,
  trackMoodSaved,
  trackMoodStepCompleted,
} from "@/lib/analytics/events";
import { selectRandomRewardCatId, type CatId } from "@/lib/cats";
import { createClientId } from "@/lib/client-id";
import {
  clearMoodDraft,
  readMoodDraft,
  writeMoodDraft,
  type MoodDraftPhase,
} from "@/lib/mood-draft";
import {
  createMoodAnalysisInput,
  validateMoodAnalysisResult,
  type MoodAnalysisMetadata,
} from "@/lib/mood-analysis";
import { getDataRepositories, getMoodRepository } from "@/lib/repositories";
import { DuplicateMoodRecordError } from "@/lib/repositories/moods/types";
import {
  buildMoodResult,
  CUSTOM_MOOD_OPTION_ID,
  type MoodAnswerDraft,
  type MoodResultData,
  type StepOneKind,
} from "@/lib/mood-summary";

const TIMED_EFFECT_IDS = new Set(["work-focus-difficulty", "task-completion-difficulty"]);
const TIMING_OPTIONS = ["아침", "점심", "저녁"];

const MEDICATION_STEP = {
  title: "오늘 약 효과는 어땠나요?",
  subtitle: "전반적인 약 효과 느낌을 선택해주세요. (복수선택 가능)",
  options: [
    { id: "medication-focus-good", label: "집중이 잘 됐어요" },
    { id: "similar", label: "평소와 비슷해요" },
    { id: "work-focus-difficulty", label: "업무 또는 과제 집중이 어려웠어요" },
    { id: "task-completion-difficulty", label: "해야할 일을 끝내기가 어려웠어요" },
  ],
};

const CONCENTRATION_STEP = {
  title: "오늘 약 효과는 어땠나요?",
  subtitle: "전반적인 약 효과 느낌을 선택해주세요. (복수선택 가능)",
  options: [
    { id: "medication-focus-good", label: "집중이 잘 됐어요" },
    { id: "similar", label: "평소와 비슷해요" },
    { id: "work-focus-difficulty", label: "업무 또는 과제 집중이 어려웠어요" },
    { id: "task-completion-difficulty", label: "해야할 일을 끝내기가 어려웠어요" },
  ],
};

const COMMON_STEPS = [
  {
    title: "오늘 감정 기복은 어땠나요?",
    subtitle: "전반적인 감정 상태를 모두 선택해주세요. (복수선택)",
    grid: true,
    options: [
      { id: "anxious", label: "불안" },
      { id: "irritable", label: "예민" },
      { id: "depressed", label: "우울" },
      { id: "lethargic", label: "무기력" },
      { id: "hyperfocus", label: "과몰입" },
      { id: "impulsive", label: "충동성" },
      { id: "sleep", label: "수면 문제" },
      { id: "appetite-decrease", label: "식욕 감소" },
      { id: "palpitation", label: "두근 거림" },
      { id: "headache", label: "두통" },
    ],
  },
  {
    title: "오늘 사람들과의 관계는 어땠나요?",
    subtitle: "되도록이면 가장 가까운 것에 선택해주면 좋아요.",
    options: [
      { id: "conversation-flow", label: "대화에 집중이 안되고 다른 생각을 했어요" },
      { id: "conversation-understanding", label: "집중하려 해도 이해가 잘 되지 않았어요" },
      { id: "social-withdrawal", label: "요즘은 혼자있는게 좋았어요" },
      { id: "none", label: "특별한 문제는 없었어요" },
    ],
  },
];

type DraftUpdate = Partial<{
  phase: MoodDraftPhase;
  step: number;
  answers: MoodAnswerDraft[];
  stepOneKind: StepOneKind;
  catId: CatId;
  recordedAt: string;
  analysis: MoodAnalysisMetadata;
  analysisFailed: boolean;
}>;

function emptyAnswers(): MoodAnswerDraft[] {
  return Array.from({ length: 3 }, () => ({
    selected: [],
    customText: "",
    timingsByOption: {},
  }));
}

export function MoodQuestionFlow({
  targetDateKey,
}: {
  targetDateKey: string;
  lottieAvailability: { complete: boolean };
}) {
  const restoredRequestStarted = useRef(false);
  const completionHandled = useRef(false);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<MoodDraftPhase>("questions");
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<MoodAnswerDraft[]>(emptyAnswers);
  const [stepOneKind, setStepOneKind] = useState<StepOneKind>("medication_effect");
  const [catId, setCatId] = useState<CatId>();
  const [recordedAt, setRecordedAt] = useState<string>();
  const [analysis, setAnalysis] = useState<MoodAnalysisMetadata>();
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [loadingDone, setLoadingDone] = useState(false);
  const [showExit, setShowExit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [intakeMedicationIds, setIntakeMedicationIds] = useState<string[]>([]);

  const questions = useMemo(() => [
    stepOneKind === "medication_effect" ? MEDICATION_STEP : CONCENTRATION_STEP,
    ...COMMON_STEPS,
  ], [stepOneKind]);
  const question = questions[step];
  const answer = answers[step];
  const homeHref = `/?date=${encodeURIComponent(targetDateKey)}`;
  const result: MoodResultData | null = analysis && recordedAt
    ? buildMoodResult(answers, stepOneKind, recordedAt, analysis)
    : null;

  const persistDraft = useCallback((next: DraftUpdate = {}) => {
    writeMoodDraft(window.sessionStorage, targetDateKey, {
      phase: next.phase ?? phase,
      step: next.step ?? step,
      answers: next.answers ?? answers,
      stepOneKind: next.stepOneKind ?? stepOneKind,
      catId: next.catId ?? catId,
      recordedAt: next.recordedAt ?? recordedAt,
      analysis: next.analysis ?? analysis,
      analysisFailed: next.analysisFailed ?? analysisFailed,
    });
  }, [analysis, analysisFailed, answers, catId, phase, recordedAt, step, stepOneKind, targetDateKey]);

  useEffect(() => {
    void (async () => {
      const repositories = await getDataRepositories();
      if (await repositories.moods.findByDate(targetDateKey)) {
        window.location.replace(homeHref);
        return;
      }

      const intakes = await repositories.medicationIntakes.listByDate(targetDateKey);
      const intakeIds = intakes.map((item) => item.medicationId);
      const draft = readMoodDraft(window.sessionStorage, targetDateKey);
      const kind = draft?.stepOneKind ?? "medication_effect";

      setIntakeMedicationIds(intakeIds);
      setStepOneKind(kind);
      if (draft) {
        let restoredAnalysis: MoodAnalysisMetadata | undefined;
        if (draft.analysis && draft.recordedAt) {
          try {
            const restoredInput = createMoodAnalysisInput({
              date: targetDateKey,
              recordedAt: draft.recordedAt,
              stepOneKind: kind,
              answers: draft.answers,
              intakeMedicationIds: intakeIds,
            });
            restoredAnalysis = {
              ...draft.analysis,
              result: validateMoodAnalysisResult(draft.analysis.result, restoredInput),
            };
          } catch {
            restoredAnalysis = undefined;
          }
        }

        setAnswers(draft.answers);
        setStep(draft.step);
        const restoredPhase = draft.phase === "result" && !restoredAnalysis
          ? "summarizing"
          : draft.phase;
        setPhase(restoredPhase);
        setCatId(draft.catId);
        setRecordedAt(draft.recordedAt);
        setAnalysis(restoredAnalysis);
        setAnalysisFailed(Boolean(
          draft.analysisFailed || (draft.analysis && !restoredAnalysis),
        ));
        setLoadingDone(restoredPhase === "result");
      }

      window.history.replaceState({
        ...window.history.state,
        moodStep: draft?.step ?? 0,
        moodPhase: draft?.phase ?? "questions",
      }, "");
      setReady(true);
      ensureMoodAttempt("home");
    })().catch(() => window.location.replace(homeHref));
  }, [homeHref, targetDateKey]);

  useEffect(() => {
    if (ready) persistDraft();
  }, [persistDraft, ready]);

  useEffect(() => {
    if (!ready) return;
    const onPopState = (event: PopStateEvent) => {
      const historyStep = Number(event.state?.moodStep);
      if (
        event.state?.moodPhase === "questions"
        && Number.isInteger(historyStep)
        && historyStep >= 0
        && historyStep < questions.length
      ) {
        setStep(historyStep);
        setPhase("questions");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [questions.length, ready]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [phase, step]);

  const requestAnalysis = useCallback(async (
    timestamp = recordedAt,
    reward = catId,
  ) => {
    if (!timestamp) return;
    setAnalysisFailed(false);
    setPhase("summarizing");
    persistDraft({
      phase: "summarizing",
      catId: reward,
      recordedAt: timestamp,
      analysisFailed: false,
    });
    const input = createMoodAnalysisInput({
      date: targetDateKey,
      recordedAt: timestamp,
      stepOneKind,
      answers,
      intakeMedicationIds,
    });

    try {
      const response = await fetch("/api/moods/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      if (!response.ok) throw new Error("analysis_failed");
      const payload = await response.json() as MoodAnalysisMetadata;
      const metadata: MoodAnalysisMetadata = {
        ...payload,
        result: validateMoodAnalysisResult(payload.result, input),
      };
      setAnalysis(metadata);
      persistDraft({
        phase: "summarizing",
        catId: reward,
        recordedAt: timestamp,
        analysis: metadata,
        analysisFailed: false,
      });
    } catch {
      setAnalysisFailed(true);
      persistDraft({
        phase: "summarizing",
        catId: reward,
        recordedAt: timestamp,
        analysisFailed: true,
      });
    }
  }, [answers, catId, intakeMedicationIds, persistDraft, recordedAt, stepOneKind, targetDateKey]);

  useEffect(() => {
    if (!ready || phase !== "summarizing" || analysis || restoredRequestStarted.current) return;
    restoredRequestStarted.current = true;
    void requestAnalysis();
  }, [analysis, phase, ready, requestAnalysis]);

  useEffect(() => {
    if (phase === "summarizing" && analysis && loadingDone) {
      setPhase("result");
      persistDraft({ phase: "result", analysis });
    }
  }, [analysis, loadingDone, persistDraft, phase]);

  useEffect(() => {
    if (phase !== "result") return;
    trackMoodResultViewed();
    if (!catId) return;
    const rewardKey = `addi:analytics:mood-reward-revealed:v1:${targetDateKey}:${catId}`;
    try {
      if (window.sessionStorage.getItem(rewardKey) === "1") return;
      window.sessionStorage.setItem(rewardKey, "1");
    } catch {
      // Analytics state must never block the product flow.
    }
    trackMoodCatRewardRevealed(catId);
  }, [catId, phase, targetDateKey]);

  function updateAnswer(update: (current: MoodAnswerDraft) => MoodAnswerDraft) {
    setAnswers((current) => current.map((item, index) => (
      index === step ? update(item) : item
    )));
  }

  function toggleOption(id: string) {
    updateAnswer((item) => {
      const alreadySelected = item.selected.includes(id);
      const selected = alreadySelected
        ? item.selected.filter((value) => value !== id)
        : step === 2 && id === "none"
          ? [id]
          : step === 2
            ? [...item.selected.filter((value) => value !== "none"), id]
            : [...item.selected, id];

      return {
        ...item,
        selected,
        customText: step === 2 && id === "none" ? "" : item.customText,
        timingsByOption: alreadySelected && TIMED_EFFECT_IDS.has(id)
          ? Object.fromEntries(Object.entries(item.timingsByOption ?? {}).filter(([key]) => key !== id))
          : item.timingsByOption,
      };
    });
  }

  function toggleTiming(id: string, timing: string) {
    updateAnswer((item) => {
      const current = item.timingsByOption?.[id] ?? [];
      return {
        ...item,
        timingsByOption: {
          ...item.timingsByOption,
          [id]: current.includes(timing)
            ? current.filter((value) => value !== timing)
            : [...current, timing],
        },
      };
    });
  }

  const customSelected = answer.selected.includes(CUSTOM_MOOD_OPTION_ID);
  const canContinue = answer.selected.some((id) => id !== CUSTOM_MOOD_OPTION_ID)
    || (customSelected && answer.customText.trim().length > 0);

  function goBack() {
    if (step > 0) window.history.back();
    else window.location.assign(homeHref);
  }

  function discardDraftAndGoHome() {
    clearMoodDraft(window.sessionStorage, targetDateKey);
    window.location.assign(homeHref);
  }

  function goToNextStep() {
    if (!canContinue || completionHandled.current) return;
    trackMoodStepCompleted((step + 1) as 1 | 2 | 3);
    if (step < 2) {
      const nextStep = step + 1;
      window.history.pushState({
        ...window.history.state,
        moodStep: nextStep,
        moodPhase: "questions",
      }, "");
      setStep(nextStep);
      return;
    }

    completionHandled.current = true;
    restoredRequestStarted.current = true;
    const reward = catId ?? selectRandomRewardCatId();
    const timestamp = recordedAt ?? new Date().toISOString();
    setCatId(reward);
    setRecordedAt(timestamp);
    setAnalysis(undefined);
    setAnalysisFailed(false);
    setLoadingDone(false);
    setPhase("summarizing");
    persistDraft({
      phase: "summarizing",
      catId: reward,
      recordedAt: timestamp,
      analysisFailed: false,
    });
    trackMoodCompleted();
    void requestAnalysis(timestamp, reward);
  }

  async function save() {
    if (!result || !catId || saving) return;
    setSaving(true);
    try {
      const repository = await getMoodRepository();
      await repository.save({
        date: targetDateKey,
        mood: result.moodType,
        moodLabel: result.label,
        recordedAt: result.recordedAt,
        diaryEntries: result.checkItems,
        memberSummary: result.memberSummary,
        clinicPhrase: result.clinicPhrase,
        details: result.details,
        catId,
        analysisStatus: "completed",
        analysisResult: result.analysis.result,
        analysisVersion: result.analysis.version,
        analysisModel: result.analysis.model,
        analysisCreatedAt: result.analysis.createdAt,
      });
      clearMoodDraft(window.sessionStorage, targetDateKey);
      await trackMoodSaved();
      const destination = new URL(homeHref, window.location.origin);
      destination.searchParams.set("moodToast", "saved");
      destination.searchParams.set("toastId", createClientId());
      window.location.assign(`${destination.pathname}${destination.search}`);
    } catch (error) {
      if (error instanceof DuplicateMoodRecordError) {
        window.location.replace(homeHref);
      } else {
        setSaving(false);
      }
    }
  }

  if (!ready) {
    return (
      <MobileShell className="flow-screen mood-question-screen" aria-busy="true">
        <span className="visually-hidden">감정 기록 확인 중</span>
      </MobileShell>
    );
  }

  if (phase === "summarizing") {
    return (
      <MoodSummaryLoading
        onAnimationComplete={() => setLoadingDone(true)}
      />
    );
  }

  if (phase === "result" && catId && result) {
    return (
      <MoodResult
        catId={catId}
        result={result}
        saving={saving}
        onSave={() => void save()}
      />
    );
  }

  return (
    <MobileShell className="flow-screen mood-question-screen">
      <FlowHeader
        title="감정 기록하기"
        onBack={goBack}
        onClose={() => setShowExit(true)}
      />
      <div className="mood-progress" aria-label={`${step + 1}/3 단계`}>
        {questions.map((item, index) => (
          <span className={index === step ? "active" : ""} key={item.title} />
        ))}
      </div>
      <section className="mood-question-heading">
        <h1>{question.title}</h1>
        <p>{step === 2 && answer.selected.length > 0
          ? "가장 가까운 것에 선택해주세요."
          : question.subtitle}</p>
      </section>
      <fieldset className={`mood-question-options ${"grid" in question && question.grid ? "two-column" : ""}`}>
        <legend className="visually-hidden">{question.title}</legend>
        {question.options.map((option) => {
          const selected = answer.selected.includes(option.id);
          return (
            <div className={`mood-question-option ${selected ? "selected" : ""}`} key={option.id}>
              <label className="mood-question-option-toggle">
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
              {step === 0
              && selected
              && TIMED_EFFECT_IDS.has(option.id) ? (
                <div className="mood-timing-options">
                  <p>언제부터 그렇게 느꼈나요? (선택)</p>
                  {TIMING_OPTIONS.map((timing) => (
                    <button
                      type="button"
                      className={answer.timingsByOption?.[option.id]?.includes(timing) ? "selected" : ""}
                      onClick={() => toggleTiming(option.id, timing)}
                      key={timing}
                    >
                      <span>{timing}</span>
                      <span aria-hidden="true">✓</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        <div className={`mood-question-option custom ${customSelected ? "selected" : ""}`}>
          <label className="mood-question-option-toggle">
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
          {customSelected ? (
            <input
              className="mood-question-custom-input"
              type="text"
              value={answer.customText}
              placeholder="내용을 입력해주세요."
              aria-label={`${question.title} 직접 입력`}
              onChange={(event) => updateAnswer((item) => ({
                ...item,
                customText: event.target.value,
              }))}
            />
          ) : null}
        </div>
      </fieldset>
      <BottomActions>
        <PrimaryButton type="button" disabled={!canContinue} onClick={goToNextStep}>
          {step === 2 ? "완료" : `다음 (${step + 1}/3)`}
        </PrimaryButton>
      </BottomActions>
      {showExit ? (
        <VisitDialog
          title="감정 기록을 중단할까요?"
          cancelLabel="취소"
          confirmLabel="중단하기"
          onCancel={() => setShowExit(false)}
          onConfirm={discardDraftAndGoHome}
        />
      ) : null}
    </MobileShell>
  );
}
