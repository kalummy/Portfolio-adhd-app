import { MoodHistory } from "@/components/mood-history";

export default async function MoodHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const { deleted } = await searchParams;
  return <MoodHistory showDeletedToast={deleted === "1"} />;
}
