import type { MoodAnalysisMetadata } from "./mood-analysis";
import type { MoodRecord } from "./types";

export const CUSTOM_MOOD_OPTION_ID = "custom";
export type StepOneKind = "medication_effect" | "concentration";
export type MoodAnswerDraft = { selected: string[]; customText: string; timingsByOption?: Record<string, string[]> };
export type MoodType = "good" | "lethargic" | "lethargic-depressed" | "poor-condition" | "irritable";
export type MoodPresentation = { label: string; imagePath: string };
export type MoodResultData = MoodPresentation & { moodType: MoodType; recordedAt: string; checkItems: string[]; clinicPhrase: string; memberSummary: string; details: NonNullable<MoodRecord["details"]>; analysis: MoodAnalysisMetadata };

export const MOOD_PRESENTATIONS: Record<MoodType, MoodPresentation> = {
  good: { label: "기분이 좋아요", imagePath: "/moods/good.png" }, lethargic: { label: "무기력해요", imagePath: "/moods/lethargic.png" },
  "lethargic-depressed": { label: "무기력하고 우울해요", imagePath: "/moods/lethargic-depressed.png" }, "poor-condition": { label: "컨디션이 나빠요", imagePath: "/moods/poor-condition.png" }, irritable: { label: "화가 나고 예민해요", imagePath: "/moods/irritable.png" },
};
function cleanCustom(answer: MoodAnswerDraft | undefined) { return answer?.selected.includes(CUSTOM_MOOD_OPTION_ID) ? answer.customText.replace(/\s+/gu, " ").trim() : ""; }
export function determineMoodType(answers: MoodAnswerDraft[]): MoodType {
  const selected = new Set(answers[1]?.selected ?? []);
  if (selected.has("depressed") && selected.has("lethargic")) return "lethargic-depressed";
  if (selected.has("irritable") || selected.has("anxious") || selected.has("impulsive")) return "irritable";
  if (selected.has("lethargic") || selected.has("depressed")) return "lethargic";
  if (selected.has("sleep") || selected.has("appetite") || selected.has("palpitation") || selected.has("headache")) return "poor-condition";
  return "good";
}
export function buildMoodDetails(answers: MoodAnswerDraft[], stepOneKind: StepOneKind): NonNullable<MoodRecord["details"]> {
  return { stepOneKind, medicationEffects: stepOneKind === "medication_effect" ? answers[0]?.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID) ?? [] : [], concentrationStates: stepOneKind === "concentration" ? answers[0]?.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID) ?? [] : [], medicationEffectTimings: stepOneKind === "medication_effect" ? answers[0]?.timingsByOption ?? {} : {}, moods: answers[1]?.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID) ?? [], relationships: answers[2]?.selected.filter((id) => id !== CUSTOM_MOOD_OPTION_ID) ?? [], customText: { medicationEffect: cleanCustom(answers[0]), mood: cleanCustom(answers[1]), relationship: cleanCustom(answers[2]) } };
}
export function buildMoodResult(answers: MoodAnswerDraft[], stepOneKind: StepOneKind, recordedAt: string, analysis: MoodAnalysisMetadata): MoodResultData {
  const moodType = determineMoodType(answers); const checkItems = analysis.result.todayEmotion.map((item) => item.text);
  return { moodType, ...MOOD_PRESENTATIONS[moodType], recordedAt, checkItems, clinicPhrase: analysis.result.clinicPhrase.text, memberSummary: analysis.result.clinicPhrase.text.slice(0, 300), details: buildMoodDetails(answers, stepOneKind), analysis };
}
export function getMoodDiarySummary(entries: string[] | undefined) { return (entries ?? []).map((entry) => entry.replace(/\s+/gu, " ").trim()).filter(Boolean).join(" ") || "기록된 요약이 없어요."; }
export function getMoodPresentation(mood: string): MoodPresentation { return MOOD_PRESENTATIONS[mood as MoodType] ?? MOOD_PRESENTATIONS["poor-condition"]; }
