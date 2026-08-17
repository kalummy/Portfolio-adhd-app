import { MedicationMethodScreen } from "@/components/medication-method-screen";

export default async function MedicationMethodPage({
  searchParams,
}: {
  searchParams: Promise<{ origin?: string }>;
}) {
  const { origin } = await searchParams;
  const returnHref = origin === "medications" ? "/medications" : "/";

  return <MedicationMethodScreen returnHref={returnHref} />;
}
