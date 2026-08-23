export type RegistrationMethod = "search" | "manual" | "photo";
export type MedicationSchedule = "daily" | "as-needed" | "bedtime";
export type OfficialMedicationMatchStatus =
  | "matched"
  | "not-found"
  | "ambiguous"
  | "unavailable";

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
  officialMatchStatus?: OfficialMedicationMatchStatus;
};

export type DraftMedication = MedicationCandidate & {
  draftId: string;
  source: RegistrationMethod;
  schedule?: MedicationSchedule;
};

export type MedicationDraft = {
  draftMedications: DraftMedication[];
  pendingCandidates: DraftMedication[];
  provisionalDraftIds: string[];
  activeScheduleDraftId?: string;
  scheduleQueueDraftIds: string[];
  searchQuery: string;
  manualName: string;
  manualStrength: string;
};

export type SavedMedication = MedicationCandidate & {
  id: string;
  registrationMethod: RegistrationMethod;
  schedule: MedicationSchedule;
  scheduledTime?: string | null;
  createdAt: string;
  active?: boolean;
  deactivatedAt?: string;
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
  memberSummary?: string;
};

export type VisitSchedule = {
  id: "upcoming";
  visitDate: string;
  createdAt: string;
  updatedAt: string;
};

export type HomeDataSet = {
  medications: SavedMedication[];
  intakeRecords: MedicationIntakeRecord[];
  moodRecords: MoodRecord[];
  visitSchedule?: VisitSchedule | null;
};
