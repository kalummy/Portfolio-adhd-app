"use client";

import { useEffect, useRef } from "react";
import { ensureMedicationAddAttempt, trackMedicationRegistrationStepViewed, type MedicationAttemptHandle } from "./events";
import type { MedicationRegistrationStep } from "./medication-contract";

// Run after the page has committed usable draft-dependent UI. No UI gating,
// network awaits, or dependency on the generic screen_viewed classification.
export function useMedicationRegistrationStep(step: MedicationRegistrationStep, ready: boolean, trackStep = true) {
  const attempt = useRef<MedicationAttemptHandle>(null);
  useEffect(() => {
    if (!ready) return;
    attempt.current = ensureMedicationAddAttempt();
    if (trackStep) trackMedicationRegistrationStepViewed(step, attempt.current);
  }, [ready, step, trackStep]);
  return attempt;
}
