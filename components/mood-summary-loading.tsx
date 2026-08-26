"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { MobileShell } from "@/components/mobile-shell";
import { getCat, UNKNOWN_CAT, type CatId } from "@/lib/cats";

type MoodSummaryLoadingProps = {
  catId?: CatId;
  onAnimationComplete: () => void;
};

export const MOOD_CAT_REVEAL_DURATION_MS = 2000;

export function MoodSummaryLoading({
  catId,
  onAnimationComplete,
}: MoodSummaryLoadingProps) {
  const rewardCat = catId ? getCat(catId) : undefined;
  const completedRef = useRef(false);
  const onAnimationCompleteRef = useRef(onAnimationComplete);
  onAnimationCompleteRef.current = onAnimationComplete;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onAnimationCompleteRef.current();
    }, MOOD_CAT_REVEAL_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <MobileShell className="mood-summary-screen" aria-live="polite" aria-busy="true">
      <div className="mood-summary-copy">
        <h1>
          <span>두근 두근</span>
          <span>어떤 고양이가 나올까요?</span>
        </h1>
        <div className="mood-summary-animation-frame" aria-hidden="true">
          <Image
            className="mood-summary-reveal-cat"
            src={UNKNOWN_CAT.imagePath}
            alt=""
            width={238}
            height={238}
            priority
          />
          {rewardCat ? (
            <Image
              className="mood-summary-reward-preload"
              src={rewardCat.imagePath}
              alt=""
              width={160}
              height={160}
              loading="eager"
              fetchPriority="high"
            />
          ) : null}
        </div>
      </div>
    </MobileShell>
  );
}
