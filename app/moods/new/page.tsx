import { existsSync } from "node:fs";
import { join } from "node:path";
import { MoodQuestionFlow } from "@/components/mood-question-flow";
import { getKstDateKey, isValidDateKey } from "@/lib/kst-date";

function hasPublicAsset(relativePath: string) {
  return existsSync(join(process.cwd(), "public", relativePath));
}

export default async function NewMoodPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { date } = await searchParams;
  const requestedDate = Array.isArray(date) ? date[0] : date;
  const targetDateKey = isValidDateKey(requestedDate) ? requestedDate : getKstDateKey();
  return (
    <MoodQuestionFlow
      key={targetDateKey}
      targetDateKey={targetDateKey}
      lottieAvailability={{
        complete: hasPublicAsset("lottie/mood-complete.json"),
      }}
    />
  );
}
