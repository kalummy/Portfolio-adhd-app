"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { MedicationCandidate } from "@/lib/types";
import { resolveMedicationImage } from "@/lib/medication-images";
import { medicationLabel } from "@/lib/medication-utils";

export function MedicationSummaryCard({
  medication,
  compact = false,
}: {
  medication: MedicationCandidate;
  compact?: boolean;
}) {
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const label = medicationLabel(medication);
  const existingImage = medication.productImage ?? medication.imagePath;
  const image = resolveMedicationImage({
    medicationId: medication.catalogId,
    medicationName: label,
    existingImage,
    fallbackImage: medication.fallbackImage ?? medication.imagePath,
    failedSources,
  });

  useEffect(() => setFailedSources(new Set()), [
    medication.fallbackImage,
    medication.imagePath,
    medication.catalogId,
    medication.productImage,
    label,
  ]);

  const isFallbackImage = image.type === "fallback";

  return (
    <article className={`medication-summary-card ${compact ? "compact" : ""}`}>
      <div className={`medication-image-wrap ${isFallbackImage ? "fallback" : ""}`}>
        {isFallbackImage ? (
          <Image
            src={image.src}
            alt=""
            width={64}
            height={64}
            className="medication-image fallback"
            onError={() => setFailedSources((current) => (
              new Set(current).add(image.src)
            ))}
          />
        ) : (
          <Image
            src={image.src}
            alt={`${label} 제품 이미지`}
            fill
            sizes="64px"
            className="medication-image"
            onError={() => setFailedSources((current) => (
              new Set(current).add(image.src)
            ))}
          />
        )}
      </div>
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
