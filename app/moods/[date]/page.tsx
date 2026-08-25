import { redirect } from "next/navigation";
import { MoodRecordDetail } from "@/components/mood-record-detail";
import { isValidDateKey } from "@/lib/kst-date";

export default async function MoodRecordDetailPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;
  if (!isValidDateKey(date)) redirect("/moods");
  return <MoodRecordDetail dateKey={date} />;
}
