import { MoodHistory } from "@/components/mood-history";
import { isMoodHistoryPeriod } from "@/lib/mood-history";

export default async function MoodHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  return <MoodHistory initialPeriod={isMoodHistoryPeriod(period) ? period : null} />;
}
