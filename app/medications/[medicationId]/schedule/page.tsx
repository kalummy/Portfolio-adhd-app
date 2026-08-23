import { MedicationScheduleEditor } from "@/components/medication-schedule-editor";
import { isValidDateKey } from "@/lib/kst-date";

export default async function MedicationScheduleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ medicationId: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { medicationId } = await params;
  const { date } = await searchParams;
  const requestedDate = Array.isArray(date) ? date[0] : date;
  const targetDateKey = isValidDateKey(requestedDate) ? requestedDate : undefined;
  const returnHref = targetDateKey
    ? `/medications?date=${encodeURIComponent(targetDateKey)}`
    : "/medications";
  const homeHref = targetDateKey
    ? `/?date=${encodeURIComponent(targetDateKey)}`
    : "/";
  return (
    <MedicationScheduleEditor
      medicationId={medicationId}
      targetDateKey={targetDateKey}
      returnHref={returnHref}
      homeHref={homeHref}
    />
  );
}
