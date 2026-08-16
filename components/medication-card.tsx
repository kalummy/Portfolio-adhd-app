"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { MedicationCandidate } from "@/lib/types";
import { medicationLabel } from "@/lib/medication-utils";

export function MedicationSummaryCard({
  medication,
  compact = false,
}: {
  medication: MedicationCandidate;
  compact?: boolean;
}) {
  const productImage = medication.productImage?.trim();
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [productImage]);

  const isFallbackImage = !productImage || medication.imageType !== "product" || imageFailed;

  return (
    <article className={`medication-summary-card ${compact ? "compact" : ""}`}>
      <div className={`medication-image-wrap ${isFallbackImage ? "fallback" : ""}`}>
        {isFallbackImage ? (
          <Image
            src={medication.fallbackImage ?? medication.imagePath}
            alt=""
            width={64}
            height={64}
            className="medication-image fallback"
          />
        ) : (
          <Image
            src={productImage}
            alt={`${medicationLabel(medication)} 제품 이미지`}
            fill
            sizes="64px"
            className="medication-image"
            onError={() => setImageFailed(true)}
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
