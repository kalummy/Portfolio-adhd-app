import type {
  DraftMedication,
  MedicationCandidate,
  MedicationDraft,
  MedicationSchedule,
  RegistrationMethod,
} from "./types";
import { createClientId } from "./client-id";

const DRAFT_KEY = "addi-medication-registration-draft";
const LAST_SAVED_KEY = "addi-last-saved-medication-ids";
const MANUAL_RETURN_HREF_KEY = "addi-manual-medication-return-href";

const EMPTY_DRAFT: MedicationDraft = {
  draftMedications: [],
  pendingCandidates: [],
  scheduleQueueDraftIds: [],
  searchQuery: "",
  manualName: "",
  manualStrength: "",
  noticeAccepted: false,
};

function createDraftId() {
  return createClientId();
}

function toDraftMedication(
  medication: MedicationCandidate,
  source: RegistrationMethod,
  schedule?: MedicationSchedule,
): DraftMedication {
  return {
    ...medication,
    draftId: createDraftId(),
    source,
    schedule,
  };
}

function normalizeDraft(raw: Partial<MedicationDraft> & {
  medications?: MedicationCandidate[];
  method?: RegistrationMethod;
  schedule?: MedicationSchedule;
}): MedicationDraft {
  const legacyMedications = Array.isArray(raw.medications) ? raw.medications : [];
  const draftMedications = Array.isArray(raw.draftMedications)
    ? raw.draftMedications
    : legacyMedications.map((medication) =>
        toDraftMedication(medication, raw.method ?? "search", raw.schedule),
      );

  return {
    ...EMPTY_DRAFT,
    ...raw,
    draftMedications,
    pendingCandidates: Array.isArray(raw.pendingCandidates) ? raw.pendingCandidates : [],
    scheduleQueueDraftIds: Array.isArray(raw.scheduleQueueDraftIds)
      ? raw.scheduleQueueDraftIds
      : [],
  };
}

export function getDraft(): MedicationDraft {
  if (typeof window === "undefined") return { ...EMPTY_DRAFT };
  const raw = window.sessionStorage.getItem(DRAFT_KEY);
  if (!raw) return { ...EMPTY_DRAFT };

  try {
    return normalizeDraft(JSON.parse(raw));
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

export function setPendingCandidates(
  medications: MedicationCandidate[],
  source: RegistrationMethod,
) {
  return updateDraft({
    pendingCandidates: medications.map((medication) => toDraftMedication(medication, source)),
  });
}

export function clearPendingCandidates() {
  return updateDraft({ pendingCandidates: [] });
}

export function discardScheduleQueueCandidates() {
  const draft = getDraft();
  const queuedIds = new Set(draft.scheduleQueueDraftIds);
  return updateDraft({
    draftMedications: draft.draftMedications.filter(
      (medication) => !queuedIds.has(medication.draftId),
    ),
    pendingCandidates: [],
    scheduleQueueDraftIds: [],
    activeScheduleDraftId: undefined,
  });
}

export function confirmPendingCandidates() {
  const draft = getDraft();
  const existingCatalogIds = new Set(
    draft.draftMedications
      .map((medication) => medication.catalogId)
      .filter((catalogId): catalogId is string => Boolean(catalogId)),
  );
  const added: DraftMedication[] = [];

  for (const candidate of draft.pendingCandidates) {
    if (candidate.catalogId && existingCatalogIds.has(candidate.catalogId)) continue;
    if (candidate.catalogId) existingCatalogIds.add(candidate.catalogId);
    added.push(candidate);
  }

  const next = updateDraft({
    draftMedications: [...draft.draftMedications, ...added],
    pendingCandidates: [],
    scheduleQueueDraftIds: added.map((medication) => medication.draftId),
    activeScheduleDraftId: added[0]?.draftId,
  });

  return { draft: next, added };
}

export function updateDraftMedication(
  draftId: string,
  patch: Partial<Pick<DraftMedication, "schedule">>,
) {
  const draft = getDraft();
  return updateDraft({
    draftMedications: draft.draftMedications.map((medication) =>
      medication.draftId === draftId ? { ...medication, ...patch } : medication,
    ),
  });
}

export function removeDraftMedication(draftId: string) {
  const draft = getDraft();
  return updateDraft({
    draftMedications: draft.draftMedications.filter(
      (medication) => medication.draftId !== draftId,
    ),
    scheduleQueueDraftIds: draft.scheduleQueueDraftIds.filter((id) => id !== draftId),
    activeScheduleDraftId:
      draft.activeScheduleDraftId === draftId ? undefined : draft.activeScheduleDraftId,
  });
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

export function setManualReturnHref(href: string) {
  window.sessionStorage.setItem(MANUAL_RETURN_HREF_KEY, href);
}

export function getManualReturnHref() {
  if (typeof window === "undefined") return "/medications/new/search";
  return window.sessionStorage.getItem(MANUAL_RETURN_HREF_KEY) ?? "/medications/new/search";
}
