import type { MoodRecord } from "./types";

export const CUSTOM_MOOD_OPTION_ID = "custom";

export type MoodAnswerDraft = {
  selected: string[];
  customText: string;
  timingsByOption?: Record<string, string[]>;
};

export type MoodType = "good" | "lethargic" | "lethargic-depressed" | "poor-condition" | "irritable";

export type MoodPresentation = { label: string; imagePath: string };

export type MoodResultData = MoodPresentation & {
  moodType: MoodType;
  recordedAt: string;
  checkItems: string[];
  clinicPhrase: string;
  summaryItems: string[];
  memberSummary: string;
  details: NonNullable<MoodRecord["details"]>;
};

export const MOOD_PRESENTATIONS: Record<MoodType, MoodPresentation> = {
  good: { label: "기분이 좋아요", imagePath: "/moods/good.png" },
  lethargic: { label: "무기력해요", imagePath: "/moods/lethargic.png" },
  "lethargic-depressed": { label: "무기력하고 우울해요", imagePath: "/moods/lethargic-depressed.png" },
  "poor-condition": { label: "컨디션이 나빠요", imagePath: "/moods/poor-condition.png" },
  irritable: { label: "화가 나고 예민해요", imagePath: "/moods/irritable.png" },
};

const MOOD_LABELS: Record<string, string> = {
  anxious: "불안", irritable: "예민", depressed: "우울", lethargic: "무기력", hyperfocus: "과몰입",
  impulsive: "충동성", sleep: "수면 문제", appetite: "식욕 변화", palpitation: "두근 거림", headache: "두통",
};

const RELATIONSHIP_LABELS: Record<string, string> = {
  task: "업무, 과제 집중이 어려웠어요.",
  conversation: "사람들과의 대화에 집중이 안되고 힘들었어요.",
  unfinished: "할일을 모두 끝내지 못했어요.",
  none: "특별한 문제는 없었어요.",
};

const CLINIC_MOOD_LABELS: Record<string, string> = {
  anxious: "불안", irritable: "예민", depressed: "우울", lethargic: "무기력", hyperfocus: "과몰입",
  impulsive: "충동", sleep: "수면", appetite: "식욕", palpitation: "두근거림", headache: "두통",
};

const CLINIC_RELATIONSHIP_LABELS: Record<string, string> = {
  task: "업무 집중", conversation: "대화", unfinished: "일 마무리",
};

function cleanCustom(answer: MoodAnswerDraft | undefined) {
  return answer?.selected.includes(CUSTOM_MOOD_OPTION_ID)
    ? answer.customText.replace(/\s+/gu, " ").trim()
    : "";
}

function timingPhrase(answer: MoodAnswerDraft | undefined, optionId: string) {
  const timings = answer?.timingsByOption?.[optionId] ?? [];
  return timings.length > 0 ? `${timings.join("·")}에는 ` : "";
}

function buildEffectCheck(answer: MoodAnswerDraft | undefined) {
  if (!answer) return "";
  const phrases = answer.selected.flatMap((id) => {
    if (id === CUSTOM_MOOD_OPTION_ID) return [];
    if (id === "weak") return [`약 효과가 ${timingPhrase(answer, id)}약하게 느껴졌어요`];
    if (id === "strong") return [`약이 ${timingPhrase(answer, id)}너무 강하게 느껴졌어요`];
    if (id === "effective") return ["약 효과를 잘 느꼈어요"];
    if (id === "similar") return ["약 효과가 평소와 비슷했어요"];
    return [];
  });
  const custom = cleanCustom(answer);
  if (custom) phrases.push(custom);
  return phrases.length ? `${phrases.join(", ")}라고 기록했어요.` : "";
}

function buildMoodCheck(answer: MoodAnswerDraft | undefined) {
  if (!answer) return "";
  const labels = answer.selected
    .filter((id) => id !== CUSTOM_MOOD_OPTION_ID)
    .map((id) => MOOD_LABELS[id])
    .filter(Boolean);
  const custom = cleanCustom(answer);
  if (custom) labels.push(custom);
  return labels.length ? `${labels.join("·")}을 느꼈다고 기록했어요.` : "";
}

function buildRelationshipCheck(answer: MoodAnswerDraft | undefined) {
  if (!answer) return "";
  const labels = answer.selected
    .filter((id) => id !== CUSTOM_MOOD_OPTION_ID)
    .map((id) => RELATIONSHIP_LABELS[id])
    .filter(Boolean);
  const custom = cleanCustom(answer);
  if (custom) labels.push(`${custom}라고 기록했어요.`);
  return labels.join(" ");
}

function firstCustomClause(answer: MoodAnswerDraft | undefined) {
  return cleanCustom(answer).split(/[.!?。]/u)[0]?.trim() ?? "";
}

function subjectParticle(value: string) {
  const last = value.at(-1);
  if (!last) return "이";
  const syllable = last.charCodeAt(0) - 0xac00;
  return syllable >= 0 && syllable <= 0x2ba3 && syllable % 28 === 0 ? "가" : "이";
}

function buildClinicEffect(answer: MoodAnswerDraft | undefined) {
  if (!answer) return null;
  const selected = new Set(answer.selected);
  const effectId = ["weak", "strong", "effective", "similar"].find((id) => selected.has(id));
  if (effectId === "weak") {
    const timing = timingPhrase(answer, effectId).replace(/에는 $/u, "엔 ");
    return { standalone: `${timing}약효가 약했어요`, connective: `${timing}약효가 약했고` };
  }
  if (effectId === "strong") {
    const timing = timingPhrase(answer, effectId).replace(/에는 $/u, "엔 ");
    return { standalone: `${timing}약효가 강했어요`, connective: `${timing}약효가 강했고` };
  }
  if (effectId === "effective") return { standalone: "약효를 잘 느꼈어요", connective: "약효를 잘 느꼈고" };
  if (effectId === "similar") return { standalone: "약효는 평소와 비슷했어요", connective: "약효는 평소와 비슷했고" };
  const custom = firstCustomClause(answer);
  return custom ? { standalone: custom, connective: "" } : null;
}

function buildClinicMood(answer: MoodAnswerDraft | undefined) {
  if (!answer) return "";
  const labels = answer.selected
    .filter((id) => id !== CUSTOM_MOOD_OPTION_ID)
    .map((id) => CLINIC_MOOD_LABELS[id])
    .filter(Boolean)
    .slice(0, 2);
  const custom = firstCustomClause(answer);
  if (labels.length > 0) {
    const summary = labels.join("·");
    return `${summary}${subjectParticle(summary)} 있었어요`;
  }
  return custom;
}

function buildClinicRelationship(answer: MoodAnswerDraft | undefined) {
  if (!answer) return "";
  const selected = answer.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID);
  const difficulties = selected.map((id) => CLINIC_RELATIONSHIP_LABELS[id]).filter(Boolean).slice(0, 2);
  if (difficulties.length > 0) {
    const summary = difficulties.join("·");
    return `${summary}${subjectParticle(summary)} 어려웠어요`;
  }
  if (selected.includes("none")) return "관계에서 특별한 어려움은 없었어요";
  return firstCustomClause(answer);
}

function buildClinicPhrase(answers: MoodAnswerDraft[]) {
  const effect = buildClinicEffect(answers[0]);
  const mood = buildClinicMood(answers[1]);
  const relationship = buildClinicRelationship(answers[2]);
  const firstSentence = effect?.connective && mood
    ? `${effect.connective} ${mood}`
    : effect?.standalone || mood;
  return [firstSentence, relationship].filter(Boolean).map((sentence) => `${sentence}.`).join(" ");
}

export function determineMoodType(answers: MoodAnswerDraft[]): MoodType {
  const selected = new Set(answers[1]?.selected ?? []);
  if (selected.has("depressed") && selected.has("lethargic")) return "lethargic-depressed";
  if (selected.has("irritable") || selected.has("anxious") || selected.has("impulsive")) return "irritable";
  if (selected.has("lethargic") || selected.has("depressed")) return "lethargic";
  if (selected.has("sleep") || selected.has("appetite") || selected.has("palpitation") || selected.has("headache")) return "poor-condition";
  return "good";
}

export function buildMoodSummary(answers: MoodAnswerDraft[], recordedAt: string): MoodResultData {
  const moodType = determineMoodType(answers);
  const checkItems = [buildEffectCheck(answers[0]), buildMoodCheck(answers[1]), buildRelationshipCheck(answers[2])].filter(Boolean);
  const clinicPhrase = buildClinicPhrase(answers);
  const details: NonNullable<MoodRecord["details"]> = {
    medicationEffects: answers[0]?.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID) ?? [],
    medicationEffectTimings: answers[0]?.timingsByOption ?? {},
    moods: answers[1]?.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID) ?? [],
    relationships: answers[2]?.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID) ?? [],
    customText: {
      medicationEffect: cleanCustom(answers[0]), mood: cleanCustom(answers[1]), relationship: cleanCustom(answers[2]),
    },
  };
  return {
    moodType,
    ...MOOD_PRESENTATIONS[moodType],
    recordedAt,
    checkItems,
    clinicPhrase,
    summaryItems: checkItems,
    memberSummary: clinicPhrase.slice(0, 300),
    details,
  };
}

export function getMoodDiarySummary(entries: string[] | undefined) {
  return (entries ?? []).map((entry) => entry.replace(/\s+/gu, " ").trim()).filter(Boolean).join(" ") || "기록된 요약이 없어요.";
}

export function getMoodPresentation(mood: string): MoodPresentation {
  return MOOD_PRESENTATIONS[mood as MoodType] ?? MOOD_PRESENTATIONS["poor-condition"];
}
