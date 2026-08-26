export function normalizeClinicPhraseForDisplay(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}
