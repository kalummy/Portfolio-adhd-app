"use client";

import Image from "next/image";
import { useEffect } from "react";

export function MoodLoadingPrototype({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) onComplete();
  }, [onComplete]);

  return (
    <span className="mood-loading-prototype" aria-hidden="true">
      <Image className="mood-loading-prototype-start" src="/icons/mood-loading-start.svg" alt="" width={68} height={79}
        loading="eager" />
      <Image className="mood-loading-prototype-end" src="/icons/mood-loading-end.svg" alt="" width={68} height={79}
        loading="eager" onAnimationEnd={onComplete} />
    </span>
  );
}
