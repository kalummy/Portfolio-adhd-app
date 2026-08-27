import { MedicationScheduleEditor } from "@/components/medication-schedule-editor";
import { isValidDateKey } from "@/lib/kst-date";

export default async function MedicationScheduleEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ medicationId: string }>;
  searchParams: Promise<{ date?: string | string[]; origin?: string | string[] }>;
}) {
  const { medicationId } = await params;
  const { date, origin } = await searchParams;
  const requestedDate = Array.isArray(date) ? date[0] : date;
  const originValue = Array.isArray(origin) ? origin[0] : origin;
  const targetDateKey = isValidDateKey(requestedDate) ? requestedDate : undefined;
  const returnHref = originValue === "records"
    ? "/moods?tab=medications"
    : originValue === "records-manage" && targetDateKey
      ? `/medications?date=${encodeURIComponent(targetDateKey)}&origin=records`
      : originValue === "records-manage"
        ? "/medications?origin=records"
        : targetDateKey
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
