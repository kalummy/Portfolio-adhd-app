export const FEEDBACK_MAX_LENGTH = 2000;

export function normalizeFeedbackText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > FEEDBACK_MAX_LENGTH) return null;
  return normalized;
}
