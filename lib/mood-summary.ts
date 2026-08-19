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

function withSubjectParticle(phrase: string) {
  const lastCharacter = phrase.at(-1);
  if (!lastCharacter) return phrase;
  const codePoint = lastCharacter.charCodeAt(0);
  const hasFinalConsonant = codePoint >= 0xac00
    && codePoint <= 0xd7a3
    && (codePoint - 0xac00) % 28 !== 0;
  return `${phrase}${hasFinalConsonant ? "이" : "가"}`;
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
    ? "몸 상태 변화"
    : hasSideEffect
      ? "신체 변화"
      : hasConditionChange
        ? "수면·컨디션 변화"
        : "";
  const customDetails = answers.map(selectedCustomText)
    .filter(Boolean);
  const mainState = [emotion, effect].filter(Boolean).join("과 ");

  let sentence = "";
  if (mainState && change) {
    sentence = `오늘은 ${withSubjectParticle(mainState)} 있었고, ${change}도 느꼈어요.`;
  } else if (mainState) {
    sentence = `오늘은 ${withSubjectParticle(mainState)} 있었어요.`;
  } else if (change) {
    sentence = `오늘은 ${change}를 느꼈어요.`;
  } else {
    sentence = "오늘은 감정과 신체 컨디션이 평소와 비슷했어요.";
  }

  const customSentence = customDetails.length > 0
    ? ` 추가로 ${customDetails.join(" / ")}라고 기록했어요.`
    : "";
  return `${sentence}${customSentence}`.trim();
}

function summarizeLegacyDiaryEntries(entries: string[]) {
  const source = entries.join(" ");
  const hasStableMoment = /기분이 좋|평소와 (?:똑같|비슷)/u.test(source);
  const hasLethargy = /무기력/u.test(source);
  const hasDepression = /우울|예민/u.test(source);

  let emotion = "";
  if (hasLethargy && hasDepression) {
    emotion = hasStableMoment ? "기분 기복·무기력·우울감" : "무기력·우울감";
  } else if (hasLethargy) {
    emotion = hasStableMoment ? "기분 기복·무기력감" : "무기력감";
  } else if (hasDepression) {
    emotion = hasStableMoment ? "기분 기복·우울·예민함" : "우울·예민함";
  } else if (/기분이 좋/u.test(source)) {
    emotion = "안정적인 기분";
  } else if (/평소와 (?:똑같|비슷)/u.test(source)) {
    emotion = "평소와 비슷한 기분";
  }

  let effect = "";
  if (/효과가 빨리|약효.+(?:빨리|줄)/u.test(source)) effect = "오후 약효 저하";
  else if (/약이 (?:좀 )?센|강한 약효/u.test(source)) effect = "강한 약효";
  else if (/효과를 (?:느끼지 못|못 느)|불충분한 약효/u.test(source)) effect = "불충분한 약효";
  else if (/집중이 잘|집중 개선/u.test(source)) effect = "집중 개선";

  const hasSideEffect = /식욕|두통|가슴 통증|부작용/u.test(source)
    && !/특별한 부작용.+(?:없|느끼지 못)/u.test(source);
  const hasConditionChange = /잠들기|피곤|피로|긴장|초조|컨디션/u.test(source)
    && !/컨디션.+평소와/u.test(source);
  const change = hasSideEffect && hasConditionChange
    ? "몸 상태 변화"
    : hasSideEffect
      ? "신체 변화"
      : hasConditionChange
        ? "수면·컨디션 변화"
        : "";

  if (emotion || effect || change) {
    const mainState = [emotion, effect].filter(Boolean).join("과 ");
    if (mainState && change) return `오늘은 ${withSubjectParticle(mainState)} 있었고, ${change}도 느꼈어요.`;
    if (mainState) return `오늘은 ${withSubjectParticle(mainState)} 있었어요.`;
    return `오늘은 ${change}를 느꼈어요.`;
  }

  return entries.join(" ");
}

export function getMoodDiarySummary(entries: string[] | undefined) {
  const normalized = (entries ?? [])
    .map((entry) => entry.replace(/\s+/gu, " ").trim())
    .filter(Boolean);

  if (normalized.length === 0) return "오늘은 감정과 신체 컨디션이 평소와 비슷했어요.";
  if (normalized.length === 1) return normalized[0];
  return summarizeLegacyDiaryEntries(normalized);
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
