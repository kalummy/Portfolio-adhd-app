const MEMBER_SUMMARY_MAX_LENGTH = 300;

type MoodMigrationSummarySource = {
  memberSummary?: string;
  diaryEntries?: string[];
};

function normalizeSummaryText(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function limitSummaryLength(value: string) {
  return Array.from(value).slice(0, MEMBER_SUMMARY_MAX_LENGTH).join("").trimEnd();
}

export function resolveMoodMigrationSummary(record: MoodMigrationSummarySource) {
  if (record.memberSummary?.trim()) return record.memberSummary;

  const legacyDiarySummary = normalizeSummaryText(record.diaryEntries?.join(" ") ?? "");
  if (legacyDiarySummary) return limitSummaryLength(legacyDiarySummary);

  throw new Error("이전할 수 있는 감정 요약이 없는 기록이에요.");
}
