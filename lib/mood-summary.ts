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

const QUESTION_OPTION_LABELS: Array<Record<string, string>> = [
  {
    good: "기분이 좋아요",
    same: "평소와 똑같아요",
    lethargic: "무기력해요",
    "depressed-irritable": "우울하거나 예민해요",
  },
  {
    focused: "집중이 잘 됐어요",
    "too-strong": "약이 좀 센 것 같아요",
    "no-effect": "큰 효과를 느끼지 못했어요",
    "wore-off-early": "오후에 약 효과가 빨리 내려갔어요",
  },
  {
    "low-appetite": "식욕이 줄었어요",
    headache: "두통이 있었어요",
    "chest-pain": "가슴 통증이 있었어요",
    none: "특별한 부작용은 없었어요",
  },
  {
    "trouble-sleeping": "잠들기 어려웠어요",
    tired: "피곤했어요",
    anxious: "긴장되거나 초조했어요",
    same: "평소와 똑같았어요",
  },
];

function selectedAnswerText(answer: MoodAnswerDraft, questionIndex: number) {
  const labels = QUESTION_OPTION_LABELS[questionIndex] ?? {};
  const items = answer.selected
    .filter((id) => id !== CUSTOM_MOOD_OPTION_ID)
    .map((id) => labels[id])
    .filter((label): label is string => Boolean(label));

  if (
    answer.selected.includes(CUSTOM_MOOD_OPTION_ID)
    && answer.customText.trim()
  ) {
    items.push(answer.customText.trim());
  }

  return items.join(", ").replace(/[.!?。]+$/u, "");
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
  const prefixes = [
    "오늘 내 감정은 대체로",
    "약을 먹고",
    "복용하면서",
    "오늘은",
  ];
  const summaryItems = answers.flatMap((answer, index) => {
    const answerText = selectedAnswerText(answer, index);
    if (!answerText) return [];
    return [`${prefixes[index]} ${answerText}.`];
  });

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
