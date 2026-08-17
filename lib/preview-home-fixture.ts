import type { HomeDataSet, MedicationIntakeRecord, MoodRecord, SavedMedication } from "./types";

export const PREVIEW_REFERENCE_DATE = "2026-08-14";
export const PREVIEW_MINIMUM_DATE = "2026-08-12";
export const PREVIEW_MAXIMUM_DATE = "2026-08-15";

const previewMedications: SavedMedication[] = [
  {
    id: "preview-concerta-36",
    catalogId: "concerta-oros-36",
    name: "콘서타OROS서방정",
    strengthValue: 36,
    strengthUnit: "mg",
    manufacturer: "(주)한국얀센",
    englishName: "Concerta OROS Tablet 36mg",
    imagePath: "/medications/preview-concerta-36.png",
    registrationMethod: "search",
    schedule: "daily",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "preview-atomoxetine-40",
    name: "아토목신캡슐",
    strengthValue: 40,
    strengthUnit: "mg",
    manufacturer: "명인제약(주)",
    englishName: "Atomoxine Capsule 40mg",
    imagePath: "/medications/preview-atomoxetine-40.png",
    registrationMethod: "photo",
    schedule: "daily",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
  {
    id: "preview-hilase",
    displayLabel: "하이라제정",
    name: "하이라제정",
    strengthValue: 0,
    strengthUnit: "mg",
    imagePath: "/medications/preview-hilase.png",
    registrationMethod: "photo",
    schedule: "daily",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
];

function intake(
  medicationId: string,
  date: string,
  recordedAt: string,
): MedicationIntakeRecord {
  return {
    id: `${date}:${medicationId}`,
    medicationId,
    date,
    taken: true,
    recordedAt,
  };
}

const previewIntakeRecords: MedicationIntakeRecord[] = [
  intake("preview-concerta-36", "2026-08-13", "2026-08-13T01:30:00.000Z"),
  intake("preview-concerta-36", "2026-08-14", "2026-08-14T01:30:00.000Z"),
  intake("preview-atomoxetine-40", "2026-08-14", "2026-08-14T01:30:00.000Z"),
  intake("preview-hilase", "2026-08-14", "2026-08-14T01:30:00.000Z"),
];

const previewMoodRecords: MoodRecord[] = [
  {
    id: "2026-08-14",
    date: "2026-08-14",
    mood: "good",
    moodLabel: "기분 좋아요",
    recordedAt: "2026-08-14T02:05:00.000Z",
    diaryEntries: [
      "오늘 내 감정은 대체로 기분이 좋아요.",
      "복용하면서 특별한 부작용을 느끼지 못했어요.",
    ],
  },
];

export const PREVIEW_HOME_DATA: HomeDataSet = {
  medications: previewMedications,
  intakeRecords: previewIntakeRecords,
  moodRecords: previewMoodRecords,
  visitSchedule: {
    id: "upcoming",
    visitDate: "2026-09-11",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  },
};

export const PREVIEW_EMPTY_HOME_DATA: HomeDataSet = {
  medications: [],
  intakeRecords: [],
  moodRecords: [],
  visitSchedule: null,
};
