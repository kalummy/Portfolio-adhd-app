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
  const returnHref = isValidDateKey(requestedDate)
    ? `/medications?date=${encodeURIComponent(requestedDate)}`
    : "/medications";
  const homeHref = isValidDateKey(requestedDate)
    ? `/?date=${encodeURIComponent(requestedDate)}`
    : "/";
  return (
    <MedicationScheduleEditor
      medicationId={medicationId}
      returnHref={returnHref}
      homeHref={homeHref}
    />
  );
}
