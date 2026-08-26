import type { CatId } from "./cats";
import type { MoodAnswerDraft, MoodType, StepOneKind } from "./mood-summary";
import type { MoodRecord } from "./types";

export const MOOD_ANALYSIS_VERSION = "mood-daily-v1";
export const MOOD_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["todayEmotion", "clinicPhrase"],
  properties: {
    todayEmotion: { type: "array", minItems: 2, maxItems: 3, items: { $ref: "#/$defs/evidencedText" } },
    clinicPhrase: { $ref: "#/$defs/evidencedText" },
  },
  $defs: {
    evidencedText: {
      type: "object", additionalProperties: false, required: ["text", "evidenceIds"],
      properties: {
        text: { type: "string" },
        evidenceIds: { type: "array", minItems: 1, items: { type: "string" } },
      },
    },
  },
} as const;

export type EvidencedText = { text: string; evidenceIds: string[] };
export type MoodAnalysisResult = { todayEmotion: EvidencedText[]; clinicPhrase: EvidencedText };
export type MoodAnalysisMetadata = {
  result: MoodAnalysisResult;
  version: typeof MOOD_ANALYSIS_VERSION;
  model: string;
  createdAt: string;
};
export type MoodEvidence = {
  id: string;
  category: "medication_effect" | "concentration" | "emotion" | "relationship" | "direct_input";
  canonicalId?: string;
  label: string;
  timeSlots?: string[];
};
export type MoodAnalysisInput = {
  date: string;
  recordedAt: string;
  hasMedicationIntake: boolean;
  evidence: MoodEvidence[];
};
const EVIDENCE_CATEGORIES = new Set<MoodEvidence["category"]>(["medication_effect", "concentration", "emotion", "relationship", "direct_input"]);

export function validateMoodAnalysisInput(value: unknown): MoodAnalysisInput {
  if (!isObject(value) || typeof value.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value.date) || typeof value.recordedAt !== "string" || Number.isNaN(Date.parse(value.recordedAt)) || typeof value.hasMedicationIntake !== "boolean" || !Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 24) throw new Error("invalid_input");
  const ids = new Set<string>();
  const evidence = value.evidence.map((raw): MoodEvidence => {
    if (!isObject(raw) || typeof raw.id !== "string" || !/^[a-z0-9:_-]{1,80}$/u.test(raw.id) || ids.has(raw.id) || typeof raw.category !== "string" || !EVIDENCE_CATEGORIES.has(raw.category as MoodEvidence["category"]) || typeof raw.label !== "string") throw new Error("invalid_input");
    ids.add(raw.id); const label = clean(raw.label); if (!label || label.length > 300) throw new Error("invalid_input");
    const timeSlots = raw.timeSlots === undefined ? undefined : Array.isArray(raw.timeSlots) && raw.timeSlots.every((slot) => slot === "아침" || slot === "점심" || slot === "저녁") ? [...new Set(raw.timeSlots as string[])] : (() => { throw new Error("invalid_input"); })();
    return { id: raw.id, category: raw.category as MoodEvidence["category"], canonicalId: typeof raw.canonicalId === "string" ? raw.canonicalId : undefined, label, timeSlots };
  });
  return { date: value.date, recordedAt: value.recordedAt, hasMedicationIntake: value.hasMedicationIntake, evidence };
}

const STEP_LABELS: Record<StepOneKind, Record<string, string>> = {
  medication_effect: { effective: "약 효과를 잘 느꼈어요", similar: "평소와 비슷해요", weak: "효과가 약했어요", strong: "약이 너무 강하게 느껴졌어요", "medication-focus-good": "집중이 잘 됐어요", "work-focus-difficulty": "업무 또는 과제 집중이 어려웠어요", "task-completion-difficulty": "해야할 일을 끝내기가 어려웠어요" },
  concentration: { concentration_good: "집중이 잘 되었어요", concentration_similar: "평소와 비슷했어요", concentration_difficult: "집중하기 어려웠어요", concentration_unstable: "집중이 자주 흐트러졌어요", "medication-focus-good": "집중이 잘 됐어요", similar: "평소와 비슷해요", "work-focus-difficulty": "업무 또는 과제 집중이 어려웠어요", "task-completion-difficulty": "해야할 일을 끝내기가 어려웠어요" },
};
const EMOTION_LABELS: Record<string, string> = { anxious: "불안", irritable: "예민", depressed: "우울", lethargic: "무기력", hyperfocus: "과몰입", impulsive: "충동성", sleep: "수면 문제", appetite: "식욕 변화", "appetite-decrease": "식욕 감소", palpitation: "두근 거림", headache: "두통" };
const RELATIONSHIP_LABELS: Record<string, string> = { task: "업무, 과제 집중이 어려웠어요", conversation: "사람들과의 대화에 집중이 안되고 힘들었어요", unfinished: "할일을 모두 끝내지 못했어요", "conversation-flow": "대화에 집중이 안되고 다른 생각을 했어요", "conversation-understanding": "다른 사람의 이야기를 이해하기 어려웠어요", "social-withdrawal": "혼자있고 싶었어요", none: "특별한 문제는 없었어요" };

function clean(value: string) { return value.replace(/\s+/gu, " ").trim(); }

export function createMoodAnalysisInput(args: {
  date: string; recordedAt: string; stepOneKind: StepOneKind; answers: MoodAnswerDraft[];
  intakeMedicationIds: string[];
}): MoodAnalysisInput {
  const evidence: MoodEvidence[] = [];
  const addAnswers = (answer: MoodAnswerDraft | undefined, category: MoodEvidence["category"], labels: Record<string, string>, prefix: string) => {
    answer?.selected.filter((id) => id !== "custom").forEach((canonicalId) => {
      const label = labels[canonicalId];
      if (label) evidence.push({ id: `${prefix}:${canonicalId}`, category, canonicalId, label, timeSlots: answer.timingsByOption?.[canonicalId] });
    });
    if (answer?.selected.includes("custom") && clean(answer.customText)) {
      evidence.push({ id: `${prefix}:custom`, category: "direct_input", label: clean(answer.customText) });
    }
  };
  addAnswers(args.answers[0], args.stepOneKind, STEP_LABELS[args.stepOneKind], "step1");
  addAnswers(args.answers[1], "emotion", EMOTION_LABELS, "step2");
  addAnswers(args.answers[2], "relationship", RELATIONSHIP_LABELS, "step3");
  return { date: args.date, recordedAt: args.recordedAt, hasMedicationIntake: args.intakeMedicationIds.length > 0, evidence };
}

function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
const FORBIDDEN_MEDICAL_PATTERNS = [
  /용량.{0,12}(부족|많|적|과다|늘|줄|증량|감량)/u,
  /약.{0,10}(맞지 않|바꿔|변경|중단)/u,
  /복용.{0,10}(중단|변경)/u,
  /처방.{0,10}(변경|조절)/u,
  /리바운드/u,
  /(진단|질환|장애)(입니다|으로 보|일 수|같습니다|같아요)/u,
  /(원인|때문)(입니다|으로 보|인 것|일 수)/u,
  /부작용(입니다|으로 보|인 것|일 수)/u,
  /(늘려야|줄여야|중단해야|바꿔야) (합니다|해요|할 것)/u,
];
const FORBIDDEN_DISEASE_TOKENS = ["ADHD", "주의력결핍", "우울증", "불안장애", "불면증", "공황장애", "양극성장애", "조울증"];
const FORBIDDEN_MEDICATION_NAMES = ["콘서타", "메디키넷", "페니드", "스트라테라", "아토목세틴", "메틸페니데이트"];
const CONCEPT_RULES: Array<{ tokens: string[]; supports: (evidence: MoodEvidence) => boolean }> = [
  { tokens: ["두통"], supports: (e) => e.canonicalId === "headache" || e.label.includes("두통") },
  { tokens: ["식욕"], supports: (e) => e.canonicalId === "appetite" || e.canonicalId === "appetite-decrease" || e.label.includes("식욕") },
  { tokens: ["수면", "잠"], supports: (e) => e.canonicalId === "sleep" || /수면|잠/u.test(e.label) },
  { tokens: ["두근"], supports: (e) => e.canonicalId === "palpitation" || e.label.includes("두근") },
  { tokens: ["불안"], supports: (e) => e.canonicalId === "anxious" || e.label.includes("불안") },
  { tokens: ["우울"], supports: (e) => e.canonicalId === "depressed" || e.label.includes("우울") },
  { tokens: ["예민"], supports: (e) => e.canonicalId === "irritable" || e.label.includes("예민") },
  { tokens: ["무기력"], supports: (e) => e.canonicalId === "lethargic" || e.label.includes("무기력") },
  { tokens: ["충동"], supports: (e) => e.canonicalId === "impulsive" || e.label.includes("충동") },
  { tokens: ["과몰입"], supports: (e) => e.canonicalId === "hyperfocus" || e.label.includes("과몰입") },
  { tokens: ["집중"], supports: (e) => e.category === "concentration" || e.canonicalId === "task" || e.canonicalId === "conversation" || e.canonicalId === "work-focus-difficulty" || e.label.includes("집중") },
  { tokens: ["약효", "약 효과", "효과가", "약이"], supports: (e) => e.category === "medication_effect" || /약|효과/u.test(e.label) },
  { tokens: ["대화"], supports: (e) => e.canonicalId === "conversation" || e.canonicalId === "conversation-flow" || e.canonicalId === "conversation-understanding" || e.label.includes("대화") },
  { tokens: ["업무", "과제"], supports: (e) => e.canonicalId === "task" || e.canonicalId === "work-focus-difficulty" || /업무|과제/u.test(e.label) },
  { tokens: ["할 일", "할일", "마무리"], supports: (e) => e.canonicalId === "unfinished" || e.canonicalId === "task-completion-difficulty" || /할 ?일|마무리/u.test(e.label) },
];

function validateClinicPhraseQuality(text: string) {
  const sentenceCount = text.split(/[.!?]+/u).map(clean).filter(Boolean).length;
  if (sentenceCount > 3) throw new Error("low_quality_clinic_phrase");
  const repeatedConnectives = ["어려웠고", "힘들었고"];
  if (repeatedConnectives.some((phrase) => text.split(phrase).length - 1 >= 2)) {
    throw new Error("low_quality_clinic_phrase");
  }
  const repeatedEndings = ["어려웠어요", "힘들었어요", "있었어요", "느꼈어요"];
  if (repeatedEndings.some((phrase) => text.split(phrase).length - 1 >= 3)) {
    throw new Error("low_quality_clinic_phrase");
  }
}

export function validateMoodAnalysisResult(value: unknown, input: MoodAnalysisInput): MoodAnalysisResult {
  if (!isObject(value) || !Array.isArray(value.todayEmotion) || !isObject(value.clinicPhrase)) throw new Error("invalid_schema");
  const knownIds = new Set(input.evidence.map((item) => item.id));
  const validateItem = (item: unknown): EvidencedText => {
    if (!isObject(item) || typeof item.text !== "string" || !Array.isArray(item.evidenceIds)) throw new Error("invalid_schema");
    const text = clean(item.text);
    const evidenceIds = [...new Set(item.evidenceIds.filter((id): id is string => typeof id === "string"))];
    if (!text || text.length > 300 || evidenceIds.length === 0 || evidenceIds.some((id) => !knownIds.has(id))) throw new Error("invalid_evidence");
    if (FORBIDDEN_MEDICAL_PATTERNS.some((pattern) => pattern.test(text)) || FORBIDDEN_DISEASE_TOKENS.some((token) => text.includes(token)) || FORBIDDEN_MEDICATION_NAMES.some((token) => text.includes(token))) throw new Error("unsafe_medical_claim");
    const citedEvidence = input.evidence.filter((e) => evidenceIds.includes(e.id));
    for (const rule of CONCEPT_RULES) {
      if (rule.tokens.some((token) => text.includes(token)) && !citedEvidence.some(rule.supports)) throw new Error("unsupported_fact");
    }
    const timeRules = [
      { tokens: ["아침", "오전"], slots: ["아침"] },
      { tokens: ["점심"], slots: ["점심"] },
      { tokens: ["오후"], slots: ["점심", "저녁"] },
      { tokens: ["저녁"], slots: ["저녁"] },
    ];
    for (const rule of timeRules) {
      if (rule.tokens.some((token) => text.includes(token)) && !citedEvidence.some((e) => e.timeSlots?.some((slot) => rule.slots.includes(slot)))) throw new Error("unsupported_time");
    }
    if (/최근|반복적으로|계속/u.test(text) && !citedEvidence.some((e) => /최근|반복적으로|계속/u.test(e.label))) throw new Error("unsupported_frequency");
    return { text, evidenceIds };
  };
  if (value.todayEmotion.length < 2 || value.todayEmotion.length > 3) throw new Error("invalid_schema");
  const clinicPhrase = validateItem(value.clinicPhrase);
  validateClinicPhraseQuality(clinicPhrase.text);
  return { todayEmotion: value.todayEmotion.map(validateItem), clinicPhrase };
}

export const LOCAL_PREVIEW_MOOD_MODEL = "addi-local-preview-v1";

function previewTiming(evidence: MoodEvidence) {
  const slots = evidence.timeSlots ?? [];
  if (slots.length === 0) return "";
  if (slots.length === 1) return slots[0] === "점심" ? "점심 무렵부터 " : `${slots[0]}부터 `;
  return `${slots.join("과 ")}에 `;
}

function previewClause(evidence: MoodEvidence, connective: boolean) {
  const ending = connective ? "" : ".";
  const timing = previewTiming(evidence);
  const canonical: Record<string, [string, string]> = {
    effective: ["약 효과가 비교적 잘 느껴졌어요", "약 효과가 비교적 잘 느껴졌고"],
    similar: ["평소와 비슷하게 느껴졌어요", "평소와 비슷하게 느껴졌고"],
    weak: [`${timing}약 효과가 약하게 느껴졌어요`, `${timing}약 효과가 약하게 느껴졌고`],
    strong: [`${timing}약이 강하게 느껴졌어요`, `${timing}약이 강하게 느껴졌고`],
    concentration_good: ["집중이 비교적 잘 되었어요", "집중이 비교적 잘 되었고"],
    concentration_similar: ["집중 상태가 평소와 비슷했어요", "집중 상태가 평소와 비슷했고"],
    concentration_difficult: ["집중하기 어려운 순간이 있었어요", "집중하기 어려운 순간이 있었고"],
    concentration_unstable: ["집중이 자주 흐트러지는 느낌이 있었어요", "집중이 자주 흐트러지는 느낌이 있었고"],
    anxious: ["불안하게 느껴지는 순간이 있었어요", "불안하게 느껴지는 순간이 있었고"],
    irritable: ["예민하게 느껴지는 순간이 있었어요", "예민하게 느껴지는 순간이 있었고"],
    depressed: ["우울하게 느껴지는 순간이 있었어요", "우울하게 느껴지는 순간이 있었고"],
    lethargic: ["무기력하게 느껴지는 순간이 있었어요", "무기력하게 느껴지는 순간이 있었고"],
    hyperfocus: ["한 가지에 과도하게 몰입하는 순간이 있었어요", "한 가지에 과도하게 몰입하는 순간이 있었고"],
    impulsive: ["충동적으로 느껴지는 순간이 있었어요", "충동적으로 느껴지는 순간이 있었고"],
    sleep: ["수면과 관련한 어려움이 있었어요", "수면과 관련한 어려움이 있었고"],
    appetite: ["식욕의 변화가 있었어요", "식욕의 변화가 있었고"],
    "appetite-decrease": ["식욕이 감소했어요", "식욕이 감소했고"],
    palpitation: ["두근거림을 느낀 순간이 있었어요", "두근거림을 느낀 순간이 있었고"],
    headache: ["두통을 느낀 순간이 있었어요", "두통을 느낀 순간이 있었고"],
    task: ["업무나 과제에 집중하기 어려웠어요", "업무나 과제에 집중하기 어려웠고"],
    conversation: ["사람들과 대화할 때 집중하기 어려웠어요", "사람들과 대화할 때 집중하기 어려웠고"],
    unfinished: ["할 일을 모두 마무리하기 어려웠어요", "할 일을 모두 마무리하기 어려웠고"],
    "medication-focus-good": ["집중이 잘 됐어요", "집중이 잘 됐고"],
    "work-focus-difficulty": ["업무나 과제에 집중하기 어려웠어요", "업무나 과제에 집중하기 어려웠고"],
    "task-completion-difficulty": ["해야 할 일을 끝내기 어려웠어요", "해야 할 일을 끝내기 어려웠고"],
    "conversation-flow": ["대화 중 다른 생각이 들어 흐름을 놓쳤어요", "대화 중 다른 생각이 들어 흐름을 놓쳤고"],
    "conversation-understanding": ["상대방의 말을 이해하고 따라가기 어려웠어요", "상대방의 말을 이해하고 따라가기 어려웠고"],
    "social-withdrawal": ["사람들과 어울리기보다 혼자 있고 싶었어요", "사람들과 어울리기보다 혼자 있고 싶었고"],
    none: ["사람들과의 관계에서 특별한 어려움은 없었어요", "사람들과의 관계에서 특별한 어려움은 없었고"],
  };
  const pair = evidence.canonicalId ? canonical[evidence.canonicalId] : undefined;
  if (pair) return `${pair[connective ? 1 : 0]}${ending}`;
  return connective ? "직접 입력한 내용도 함께 기록했고" : "직접 입력한 내용도 함께 기록했어요.";
}

function previewGroup(
  evidence: MoodEvidence[],
  clauseBuilder = previewClause,
): EvidencedText | null {
  if (evidence.length === 0) return null;
  return {
    text: evidence.map((item, index) => clauseBuilder(item, index < evidence.length - 1)).join(" "),
    evidenceIds: evidence.map((item) => item.id),
  };
}

type ClinicObservation = EvidencedText;

function uniqueEvidenceIds(observations: ClinicObservation[]) {
  return [...new Set(observations.flatMap((item) => item.evidenceIds))];
}

function asConnective(sentence: string) {
  return sentence.replace(/습니다\.$/u, "고").replace(/어요\.$/u, "고");
}

function combineClinicObservations(
  left: ClinicObservation,
  right: ClinicObservation,
): ClinicObservation {
  return {
    text: `${asConnective(left.text)}, ${right.text}`,
    evidenceIds: uniqueEvidenceIds([left, right]),
  };
}

function medicationClinicObservation(evidence: MoodEvidence): ClinicObservation | null {
  const timing = previewTiming(evidence);
  const textById: Record<string, string> = {
    effective: "약을 복용했을 때 효과가 비교적 잘 느껴졌습니다.",
    similar: "약을 복용했을 때 효과가 평소와 비슷하게 느껴졌습니다.",
    weak: `${timing}약 효과가 줄어드는 느낌이 있었습니다.`,
    strong: `${timing}약 효과가 강하게 느껴졌습니다.`,
    "medication-focus-good": "약을 복용한 뒤 집중이 비교적 잘 되었습니다.",
  };
  const text = evidence.canonicalId ? textById[evidence.canonicalId] : undefined;
  return text ? { text, evidenceIds: [evidence.id] } : null;
}

function concentrationClinicObservation(evidence: MoodEvidence[]): ClinicObservation | null {
  const concentration = evidence.filter((item) => item.category === "concentration");
  const task = evidence.find((item) => item.canonicalId === "task" || item.canonicalId === "work-focus-difficulty");
  const taskCompletion = evidence.find((item) => item.canonicalId === "task-completion-difficulty");
  const conversation = evidence.find((item) => item.canonicalId === "conversation");
  const related = [...concentration, ...[task, taskCompletion, conversation].filter((item): item is MoodEvidence => Boolean(item))];
  if (related.length === 0) return null;

  let text = "집중 상태가 평소와 비슷하게 느껴졌습니다.";
  if (task && taskCompletion) text = `${previewTiming(task)}업무나 과제에 집중하고 해야 할 일을 끝내기 어려웠습니다.`;
  else if (task && conversation) text = "업무나 과제, 대화 상황에서 집중을 유지하기 어려웠습니다.";
  else if (task) text = `${previewTiming(task)}업무나 과제를 할 때 집중을 유지하기 어려웠습니다.`;
  else if (taskCompletion) text = `${previewTiming(taskCompletion)}해야 할 일을 끝까지 마무리하기 어려웠습니다.`;
  else if (conversation) text = "대화 중에 집중을 이어가기 어려웠습니다.";
  else if (concentration.some((item) => item.canonicalId === "concentration_unstable")) text = "집중을 이어가기 어렵게 느껴지는 때가 있었습니다.";
  else if (concentration.some((item) => item.canonicalId === "concentration_difficult")) text = "집중을 유지하기 어려운 순간이 있었습니다.";
  else if (concentration.some((item) => item.canonicalId === "concentration_good")) text = "집중이 비교적 잘 되었습니다.";

  return { text, evidenceIds: related.map((item) => item.id) };
}

function emotionClinicObservation(evidence: MoodEvidence[]): ClinicObservation | null {
  const emotions = evidence.filter((item) => item.category === "emotion");
  if (emotions.length === 0) return null;
  const labels: Record<string, string> = {
    anxious: "불안감",
    irritable: "예민함",
    depressed: "우울감",
    lethargic: "무기력감",
    hyperfocus: "한 가지에 과도하게 몰입하는 경향",
    impulsive: "충동적으로 느껴지는 순간",
    sleep: "수면 관련 어려움",
    appetite: "식욕 변화",
    "appetite-decrease": "식욕 감소",
    palpitation: "두근거림",
    headache: "두통",
  };
  const observations = emotions
    .map((item) => item.canonicalId ? labels[item.canonicalId] : undefined)
    .filter((item): item is string => Boolean(item));
  if (observations.length === 0) return null;
  const withSubjectParticle = (value: string) => {
    const last = value.at(-1)?.charCodeAt(0) ?? 0;
    const hasFinalConsonant = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
    return `${value}${hasFinalConsonant ? "이" : "가"}`;
  };
  const text = observations.length === 1
    ? `${withSubjectParticle(observations[0])} 나타나는 경우가 있었습니다.`
    : `${observations.slice(0, -1).join(", ")} 및 ${withSubjectParticle(observations.at(-1) ?? "")} 함께 나타났습니다.`;
  return { text, evidenceIds: emotions.map((item) => item.id) };
}

function relationshipClinicObservation(evidence: MoodEvidence[]): ClinicObservation | null {
  const conversationFlow = evidence.find((item) => item.canonicalId === "conversation-flow");
  const conversationUnderstanding = evidence.find((item) => item.canonicalId === "conversation-understanding");
  const socialWithdrawal = evidence.find((item) => item.canonicalId === "social-withdrawal");
  const socialEvidence = [conversationFlow, conversationUnderstanding, socialWithdrawal]
    .filter((item): item is MoodEvidence => Boolean(item));
  if (socialEvidence.length > 0) {
    const text = conversationFlow && conversationUnderstanding
      ? "대화 중 흐름을 놓치고 상대방의 말을 이해해 따라가기 어려운 경우가 있었습니다."
      : conversationFlow
        ? "대화 중 다른 생각이 들어 흐름을 놓치는 경우가 있었습니다."
        : conversationUnderstanding
          ? "상대방의 말을 이해하고 따라가기 어려운 경우가 있었습니다."
          : "사람들과 어울리기보다 혼자 있고 싶게 느껴졌습니다.";
    return { text, evidenceIds: socialEvidence.map((item) => item.id) };
  }
  const unfinished = evidence.find((item) => item.canonicalId === "unfinished");
  if (unfinished) {
    return {
      text: "해야 할 일을 끝까지 마무리하기 어려운 경우가 있었습니다.",
      evidenceIds: [unfinished.id],
    };
  }
  const none = evidence.find((item) => item.canonicalId === "none");
  return none ? {
    text: "사람들과 지낼 때 특별히 어려운 점은 없었습니다.",
    evidenceIds: [none.id],
  } : null;
}

function directInputClinicObservation(evidence: MoodEvidence[]): ClinicObservation | null {
  const directInput = evidence.filter((item) => item.category === "direct_input");
  if (directInput.length === 0) return null;
  const unsafeDirectInput = /아침|오전|점심|오후|저녁|최근|반복적으로|계속|용량|리바운드|처방|진단|질환|장애|ADHD|주의력결핍|우울증|불안장애|불면증|공황장애|양극성장애|조울증|콘서타|메디키넷|페니드|스트라테라|아토목세틴|메틸페니데이트/u;
  const safeLabels = directInput
    .map((item) => clean(item.label))
    .filter((label) => !unsafeDirectInput.test(label))
    .slice(0, 2);
  const text = safeLabels.length > 0
    ? `직접 입력한 내용으로는 “${safeLabels.join(" / ").slice(0, 120)}”라고 기록했습니다.`
    : "직접 입력한 내용도 함께 상담하고 싶습니다.";
  return { text, evidenceIds: directInput.map((item) => item.id) };
}

function buildLocalPreviewClinicPhrase(input: MoodAnalysisInput): EvidencedText {
  const medication = input.evidence
    .filter((item) => item.category === "medication_effect")
    .map(medicationClinicObservation)
    .find((item): item is ClinicObservation => Boolean(item)) ?? null;
  const directInput = directInputClinicObservation(input.evidence);
  const concentration = concentrationClinicObservation(input.evidence);
  const emotion = emotionClinicObservation(input.evidence);
  const relationship = relationshipClinicObservation(input.evidence);
  const context = concentration && emotion
    ? combineClinicObservations(concentration, emotion)
    : concentration ?? emotion;
  const observations = [
    medication,
    directInput,
    context,
    relationship,
  ].filter((item): item is ClinicObservation => Boolean(item));

  while (observations.length > 3) {
    const right = observations.pop();
    const left = observations.pop();
    if (left && right) observations.push(combineClinicObservations(left, right));
  }
  if (observations.length < 3) {
    observations.push({
      text: "이러한 내용을 진료에서 상담해보고 싶어요.",
      evidenceIds: uniqueEvidenceIds(observations),
    });
  }
  return {
    text: observations.map((item) => item.text).join(" "),
    evidenceIds: uniqueEvidenceIds(observations),
  };
}

export function createLocalPreviewMoodAnalysis(
  input: MoodAnalysisInput,
  createdAt = new Date().toISOString(),
): MoodAnalysisMetadata {
  const groups = ["step1:", "step2:", "step3:"]
    .map((prefix) => previewGroup(input.evidence.filter((item) => item.id.startsWith(prefix))))
    .filter((item): item is EvidencedText => Boolean(item));
  const todayEmotion = groups.slice(0, 3);
  const result = validateMoodAnalysisResult({
    todayEmotion,
    clinicPhrase: buildLocalPreviewClinicPhrase(input),
  }, input);
  return {
    result,
    version: MOOD_ANALYSIS_VERSION,
    model: LOCAL_PREVIEW_MOOD_MODEL,
    createdAt,
  };
}

export function toMoodRecordAnalysis(metadata: MoodAnalysisMetadata): Pick<MoodRecord, "analysisStatus" | "analysisResult" | "analysisVersion" | "analysisModel" | "analysisCreatedAt"> {
  return { analysisStatus: "completed", analysisResult: metadata.result, analysisVersion: metadata.version, analysisModel: metadata.model, analysisCreatedAt: metadata.createdAt };
}

export type CompletedMoodDraft = { catId: CatId; moodType: MoodType; recordedAt: string; details: NonNullable<MoodRecord["details"]>; analysis: MoodAnalysisMetadata };
