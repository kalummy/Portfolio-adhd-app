export type RegistrationMethod = "search" | "manual" | "photo";
export type MedicationSchedule = "daily" | "as-needed" | "bedtime";

export type MedicationCandidate = {
  catalogId?: string;
  displayLabel?: string;
  name: string;
  ingredientName?: string;
  strengthValue: number;
  strengthUnit: "mg";
  manufacturer?: string;
  englishName?: string;
  imagePath: string;
  productImage?: string;
  fallbackImage?: string;
  imageType?: "product" | "fallback";
  imageSourceName?: string;
  imageSourceUrl?: string;
  searchKeywords?: string[];
};

export type MedicationDraft = {
  method?: RegistrationMethod;
  medications: MedicationCandidate[];
  searchQuery: string;
  manualName: string;
  manualStrength: string;
  schedule?: MedicationSchedule;
  noticeAccepted: boolean;
};

export type SavedMedication = MedicationCandidate & {
  id: string;
  registrationMethod: RegistrationMethod;
  schedule: MedicationSchedule;
  createdAt: string;
};

export type MedicationIntakeRecord = {
  id: string;
  medicationId: string;
  date: string;
  taken: boolean;
  recordedAt: string;
};

export type MoodRecord = {
  id: string;
  date: string;
  mood: string;
  moodLabel: string;
  recordedAt: string;
  diaryEntries?: string[];
};

export type HomeDataSet = {
  medications: SavedMedication[];
  intakeRecords: MedicationIntakeRecord[];
  moodRecords: MoodRecord[];
};
