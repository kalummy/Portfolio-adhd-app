export const CUSTOM_MOOD_OPTION_ID = "custom";

export type MoodAnswerDraft = {
  selected: string[];
  customText: string;
};

export type MoodType =
  | "good"
  | "lethargic"
  | "lethargic-depressed"
  | "poor-condition"
  | "irritable";

export type MoodPresentation = {
  label: string;
  imagePath: string;
};

export type MoodResultData = MoodPresentation & {
  moodType: MoodType;
  recordedAt: string;
  summaryItems: string[];
};

export const MOOD_PRESENTATIONS: Record<MoodType, MoodPresentation> = {
  good: {
    label: "기분이 좋아요",
    imagePath: "/moods/good.png",
  },
  lethargic: {
    label: "무기력 해요",
    imagePath: "/moods/lethargic.png",
  },
  "lethargic-depressed": {
    label: "무기력하고 우울해요",
    imagePath: "/moods/lethargic-depressed.png",
  },
  "poor-condition": {
    label: "컨디션이 나빠요",
    imagePath: "/moods/poor-condition.png",
  },
  irritable: {
    label: "화가나고 예민해요",
    imagePath: "/moods/irritable.png",
  },
};

function selectedOptions(answer: MoodAnswerDraft | undefined) {
  return new Set(answer?.selected ?? []);
}

function selectedCustomText(answer: MoodAnswerDraft | undefined) {
  if (!answer?.selected.includes(CUSTOM_MOOD_OPTION_ID)) return "";
  return answer.customText.replace(/\s+/gu, " ").trim();
}

function buildEmotionPhrase(answer: MoodAnswerDraft | undefined) {
  const selected = selectedOptions(answer);
  const hasLethargy = selected.has("lethargic");
  const hasDepression = selected.has("depressed-irritable");
  const hasStableMoment = selected.has("good") || selected.has("same");

  if (hasLethargy && hasDepression) {
    return hasStableMoment
      ? "기분 기복·무기력·우울감"
      : "무기력·우울감";
  }
  if (hasLethargy) return hasStableMoment ? "기분 기복·무기력감" : "무기력감";
  if (hasDepression) return hasStableMoment ? "기분 기복·우울·예민함" : "우울·예민함";
  if (selected.has("good")) return "안정적인 기분";
  if (selected.has("same")) return "평소와 비슷한 기분";
  return "";
}

function buildMedicationEffectPhrase(answer: MoodAnswerDraft | undefined) {
  const selected = selectedOptions(answer);
  const focused = selected.has("focused");
  const concerns = ["too-strong", "no-effect", "wore-off-early"]
    .filter((id) => selected.has(id));

  if (concerns.length > 1) return "고르지 않은 약효";
  if (selected.has("too-strong")) return "강한 약효";
  if (selected.has("no-effect")) return "불충분한 약효";
  if (selected.has("wore-off-early")) return "오후 약효 저하";
  if (focused) return "집중 개선";
  return "";
}

function buildConciseSummary(answers: MoodAnswerDraft[]) {
  const emotion = buildEmotionPhrase(answers[0]);
  const effect = buildMedicationEffectPhrase(answers[1]);
  const sideEffects = selectedOptions(answers[2]);
  const conditions = selectedOptions(answers[3]);
  const hasSideEffect = ["low-appetite", "headache", "chest-pain"]
    .some((id) => sideEffects.has(id));
  const hasConditionChange = ["trouble-sleeping", "tired", "anxious"]
    .some((id) => conditions.has(id));
  const change = hasSideEffect && hasConditionChange
    ? "신체·수면·컨디션 변화"
    : hasSideEffect
      ? "신체 변화"
      : hasConditionChange
        ? "수면·컨디션 변화"
        : "";
  const customDetails = answers.map(selectedCustomText)
    .filter(Boolean);
  const mainState = [emotion, effect].filter(Boolean).join("·");

  let sentence = "";
  if (mainState && change) {
    sentence = `오늘은 ${mainState} 양상이었고, ${change}도 동반됐어요.`;
  } else if (mainState) {
    sentence = `오늘은 ${mainState} 양상이었어요.`;
  } else if (change) {
    sentence = `오늘은 ${change}가 동반됐어요.`;
  } else {
    sentence = "오늘은 감정과 신체 컨디션이 평소와 비슷했어요.";
  }

  const customSentence = customDetails.length > 0 ? ` 추가 기록: ${customDetails.join(" / ")}` : "";
  return `${sentence}${customSentence}`.trim();
}

export function determineMoodType(answers: MoodAnswerDraft[]): MoodType {
  const moodSelections = new Set(answers[0]?.selected ?? []);
  const conditionSelections = new Set(answers[3]?.selected ?? []);

  if (
    moodSelections.has("lethargic")
    && moodSelections.has("depressed-irritable")
  ) {
    return "lethargic-depressed";
  }
  if (moodSelections.has("depressed-irritable")) return "irritable";
  if (moodSelections.has("lethargic")) return "lethargic";
  if (moodSelections.has("good")) return "good";

  if (
    conditionSelections.has("trouble-sleeping")
    || conditionSelections.has("tired")
    || conditionSelections.has("anxious")
  ) {
    return "poor-condition";
  }

  // Figma에는 중립/직접 입력 전용 결과가 없어, 부정 컨디션이 없을 때는
  // 가장 중립적인 표정의 캐릭터를 fallback으로 사용한다.
  return "good";
}

export function buildMoodSummary(
  answers: MoodAnswerDraft[],
  recordedAt: string,
): MoodResultData {
  const moodType = determineMoodType(answers);
  const presentation = MOOD_PRESENTATIONS[moodType];
  const summaryItems = [buildConciseSummary(answers)];

  return {
    moodType,
    ...presentation,
    recordedAt,
    summaryItems,
  };
}

export function getMoodPresentation(mood: string): MoodPresentation {
  return MOOD_PRESENTATIONS[mood as MoodType] ?? MOOD_PRESENTATIONS["poor-condition"];
}
