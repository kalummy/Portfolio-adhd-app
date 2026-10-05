"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { MedicationCandidate } from "@/lib/types";
import { resolveMedicationImage } from "@/lib/medication-images";
import { medicationLabel } from "@/lib/medication-utils";
import styles from "./medication-thumbnail.module.css";

export function MedicationThumbnail({
  medication,
  className,
  describeProduct = false,
}: {
  medication: MedicationCandidate;
  className: string;
  describeProduct?: boolean;
}) {
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set());
  const label = medicationLabel(medication);
  const image = resolveMedicationImage({
    medicationId: medication.catalogId,
    medicationName: label,
    existingImage: medication.productImage,
    legacyImage: medication.imagePath,
    catalogImage: medication.officialMatchStatus === "matched" && /^\d{9}$/.test(medication.catalogId ?? "")
      ? `/api/medications/image/${medication.catalogId}` : undefined,
    fallbackImage: medication.fallbackImage,
    failedSources,
  });
  useEffect(() => setFailedSources(new Set()), [
    medication.catalogId, medication.productImage, medication.imagePath,
    medication.fallbackImage, label,
  ]);
  useEffect(() => {
    const retry = () => setFailedSources((current) => current.size ? new Set() : current);
    const onVisible = () => { if (document.visibilityState === "visible") retry(); };
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", retry);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <div className={`${className} ${styles.thumbnail} ${image.type === "fallback" ? "fallback" : ""}`} data-image-type={image.type}>
      <Image
        key={image.src}
        src={image.src}
        alt={describeProduct && image.type === "product" ? `${label} 제품 이미지` : ""}
        fill
        sizes="64px"
        unoptimized={image.type === "fallback"}
        onError={() => setFailedSources((current) => (
          current.has(image.src) ? current : new Set(current).add(image.src)
        ))}
      />
    </div>
  );
}
