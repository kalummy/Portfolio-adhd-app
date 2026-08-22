import { MoodQuestionFlow } from "@/components/mood-question-flow";
import { getKstDateKey, isValidDateKey } from "@/lib/kst-date";

export default async function NewMoodPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { date } = await searchParams;
  const requestedDate = Array.isArray(date) ? date[0] : date;
  const targetDateKey = isValidDateKey(requestedDate) ? requestedDate : getKstDateKey();
  return <MoodQuestionFlow targetDateKey={targetDateKey} />;
}
