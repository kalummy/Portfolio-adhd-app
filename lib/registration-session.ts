import type { MedicationDraft } from "./types";

const DRAFT_KEY = "addi-medication-registration-draft";
const LAST_SAVED_KEY = "addi-last-saved-medication-ids";

const EMPTY_DRAFT: MedicationDraft = {
  medications: [],
  searchQuery: "",
  manualName: "",
  manualStrength: "",
  noticeAccepted: false,
};

export function getDraft(): MedicationDraft {
  if (typeof window === "undefined") return { ...EMPTY_DRAFT };
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return { ...EMPTY_DRAFT };

  try {
    return { ...EMPTY_DRAFT, ...JSON.parse(raw) } as MedicationDraft;
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export function updateDraft(patch: Partial<MedicationDraft>) {
  const next = { ...getDraft(), ...patch };
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}

export function resetDraft(patch: Partial<MedicationDraft> = {}) {
  const next = { ...EMPTY_DRAFT, ...patch };
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  return next;
}

export function clearDraft() {
  window.sessionStorage.removeItem(DRAFT_KEY);
}

export function setLastSavedMedicationIds(ids: string[]) {
  window.sessionStorage.setItem(LAST_SAVED_KEY, JSON.stringify(ids));
}

export function getLastSavedMedicationIds(): string[] {
  const raw = window.sessionStorage.getItem(LAST_SAVED_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
