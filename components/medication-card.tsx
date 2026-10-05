"use client";

import type { MedicationCandidate } from "@/lib/types";
import { MedicationThumbnail } from "./medication-thumbnail";
import { medicationLabel } from "@/lib/medication-utils";

export function MedicationSummaryCard({
  medication,
  compact = false,
}: {
  medication: MedicationCandidate;
  compact?: boolean;
}) {
  return (
    <article className={`medication-summary-card ${compact ? "compact" : ""}`}>
      <MedicationThumbnail medication={medication} className="medication-image-wrap" describeProduct />
      <div className="medication-copy">
        <div className="medication-product-description">
          <strong>{medicationLabel(medication)}</strong>
          {medication.englishName ? <span>{medication.englishName}</span> : null}
        </div>
        {medication.manufacturer ? (
          <div className="medication-manufacturer-info">
            <span>{medication.manufacturer}</span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
