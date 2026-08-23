import { MedicationMethodScreen } from "@/components/medication-method-screen";
import { isValidDateKey } from "@/lib/kst-date";

export default async function MedicationMethodPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string; date?: string }>;
}) {
  const { origin, date } = await searchParams;
  const dateQuery = isValidDateKey(date) ? `?date=${encodeURIComponent(date)}` : "";
  const returnHref = origin === "medications"
    ? `/medications${dateQuery}`
    : `/${dateQuery}`;

  return <MedicationMethodScreen returnHref={returnHref} />;
}
