"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MobileShell } from "@/components/mobile-shell";
import {
  getDraft,
  registrationHref,
} from "@/lib/registration-session";

export default function MedicationNoticePage() {
  const router = useRouter();

  useEffect(() => {
    const draft = getDraft();
    router.replace(registrationHref(
      draft.draftMedications.length > 0 ? "/medications/new/review" : "/medications/new/search",
    ));
  }, [router]);

  return (
    <MobileShell className="flow-screen">{null}</MobileShell>
  );
}
