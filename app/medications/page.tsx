"use client";
import { Suspense } from "react";
import { MedicationListContent } from "@/components/medication-list-screen";
import { MobileShell } from "@/components/mobile-shell";
export default function MedicationListPage() {
  return <Suspense fallback={<MobileShell className="flow-screen medication-list-screen">{null}</MobileShell>}><MedicationListContent /></Suspense>;
}
