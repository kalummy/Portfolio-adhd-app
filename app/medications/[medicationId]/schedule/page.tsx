import { MedicationScheduleEditor } from "@/components/medication-schedule-editor";

export default async function MedicationScheduleEditPage({
  params,
}: {
  params: Promise<{ medicationId: string }>;
}) {
  const { medicationId } = await params;
  return <MedicationScheduleEditor medicationId={medicationId} />;
}
