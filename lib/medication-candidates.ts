import { MEDICATION_FALLBACK_IMAGE } from "./medication-utils";
import type {
  MedicationCandidate,
  OfficialMedicationMatchStatus,
} from "./types";

const DOSAGE_FORMS = [
  "구강붕해정",
  "리타드캡슐",
  "서방캡슐",
  "연질캡슐",
  "장용캡슐",
  "서방정",
  "장용정",
  "캡슐",
  "시럽",
  "산",
  "액",
  "정",
] as const;

function stripStrength(value: string) {
  return value.replace(
    /\d+(?:[.,]\d+)?\s*(?:mg|㎎|밀리그(?:램|람))/gi,
    "",
  );
}

export function normalizeMedicationProductName(value: string) {
  return stripStrength(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^가-힣a-z0-9]/g, "");
}

function dosageForm(value: string) {
  const normalized = normalizeMedicationProductName(value);
  return DOSAGE_FORMS.find((form) => normalized.endsWith(form));
}

function candidateNames(candidate: MedicationCandidate) {
  return [candidate.name, candidate.displayLabel]
    .filter((value): value is string => Boolean(value))
    .map(normalizeMedicationProductName);
}

export type OfficialMedicationSelection =
  | { status: "matched"; medication: MedicationCandidate }
  | { status: "not-found" }
  | { status: "ambiguous" };

export function selectOfficialMedicationCandidate(
  name: string,
  strengthValue: number,
  candidates: MedicationCandidate[],
): OfficialMedicationSelection {
  const normalizedName = normalizeMedicationProductName(name);
  if (!normalizedName || !Number.isFinite(strengthValue) || strengthValue <= 0) {
    return { status: "not-found" };
  }

  const exactMatches = candidates.filter((candidate) => (
    candidate.catalogId
    && Math.abs(candidate.strengthValue - strengthValue) < 0.001
    && candidateNames(candidate).includes(normalizedName)
  ));

  if (exactMatches.length === 1) {
    return { status: "matched", medication: exactMatches[0] };
  }
  if (exactMatches.length === 0) return { status: "not-found" };

  const requestedForm = dosageForm(name);
  if (!requestedForm) return { status: "ambiguous" };

  const formMatches = exactMatches.filter((candidate) => (
    dosageForm(candidate.name) === requestedForm
    || dosageForm(candidate.displayLabel ?? "") === requestedForm
  ));
  return formMatches.length === 1
    ? { status: "matched", medication: formMatches[0] }
    : { status: "ambiguous" };
}

export function selectOfficialManualMedicationCandidate(
  name: string,
  strengthValue: number,
  candidates: MedicationCandidate[],
): OfficialMedicationSelection {
  const exactSelection = selectOfficialMedicationCandidate(name, strengthValue, candidates);
  if (exactSelection.status !== "not-found") return exactSelection;

  const normalizedName = normalizeMedicationProductName(name);
  if (normalizedName.length < 2 || !Number.isFinite(strengthValue) || strengthValue <= 0) {
    return { status: "not-found" };
  }

  const prefixMatches = candidates.filter((candidate) => (
    candidate.catalogId
    && Math.abs(candidate.strengthValue - strengthValue) < 0.001
    && candidateNames(candidate).some((candidateName) => candidateName.startsWith(normalizedName))
  ));

  if (prefixMatches.length === 1) {
    return { status: "matched", medication: prefixMatches[0] };
  }
  return prefixMatches.length === 0
    ? { status: "not-found" }
    : { status: "ambiguous" };
}

export function createManualMedicationCandidate(
  name: string,
  strengthValue: number,
  officialMatchStatus: Exclude<OfficialMedicationMatchStatus, "matched">,
): MedicationCandidate {
  return {
    name: name.trim(),
    strengthValue,
    strengthUnit: "mg",
    imagePath: MEDICATION_FALLBACK_IMAGE,
    fallbackImage: MEDICATION_FALLBACK_IMAGE,
    imageType: "fallback",
    officialMatchStatus,
  };
}
