"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { MedicationCandidate } from "@/lib/types";
import { MEDICATION_FALLBACK_IMAGE, medicationLabel } from "@/lib/medication-utils";

export function MedicationSummaryCard({
  medication,
  compact = false,
}: {
  medication: MedicationCandidate;
  compact?: boolean;
}) {
  const productImage = medication.productImage?.trim();
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const hasProductImage = Boolean(productImage && medication.imageType === "product");
  const candidates = [
    ...(hasProductImage ? [productImage!] : []),
    medication.fallbackImage,
    medication.imagePath,
    MEDICATION_FALLBACK_IMAGE,
  ].filter((source, index, values): source is string => (
    Boolean(source) && values.indexOf(source) === index
  ));
  const displayedImage = candidates.find((source) => !failedSources.has(source))
    ?? MEDICATION_FALLBACK_IMAGE;

  useEffect(() => setFailedSources(new Set()), [
    medication.fallbackImage,
    medication.imagePath,
    productImage,
  ]);

  const isFallbackImage = displayedImage !== productImage;

  return (
    <article className={`medication-summary-card ${compact ? "compact" : ""}`}>
      <div className={`medication-image-wrap ${isFallbackImage ? "fallback" : ""}`}>
        {isFallbackImage ? (
          <Image
            src={displayedImage}
            alt=""
            width={64}
            height={64}
            className="medication-image fallback"
            onError={() => setFailedSources((current) => (
              new Set(current).add(displayedImage)
            ))}
          />
        ) : (
          <Image
            src={productImage}
            alt={`${medicationLabel(medication)} 제품 이미지`}
            fill
            sizes="64px"
            className="medication-image"
            onError={() => setFailedSources((current) => (
              new Set(current).add(displayedImage)
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
