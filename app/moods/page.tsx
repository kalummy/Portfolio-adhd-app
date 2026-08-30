import { MoodHistory } from "@/components/mood-history";

export default async function MoodHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string; tab?: string }>;
}) {
  const { deleted, tab } = await searchParams;
  return (
    <MoodHistory
      showDeletedToast={deleted === "1"}
      initialTab={tab === "report" ? "report" : "records"}
    />
  );
}
