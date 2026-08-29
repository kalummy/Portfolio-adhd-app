"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  LEGACY_HOME_SPLASH_SESSION_KEY,
  MEMBER_SPLASH_SESSION_KEY,
} from "@/lib/auth/routes";

const SPLASH_STEPS = [
  { at: 300, variant: 1 },
  { at: 1100, variant: 2 },
  { at: 2000, variant: 3 },
] as const;
const SPLASH_COMPLETE_MS = 2500;

type MemberBrandLockupProps = {
  revealFirstLine?: boolean;
  revealSecondLine?: boolean;
  revealLogo?: boolean;
  reducedMotion?: boolean;
};

export function MemberBrandLockup({
  revealFirstLine = true,
  revealSecondLine = true,
  revealLogo = true,
  reducedMotion = false,
}: MemberBrandLockupProps) {
  return (
    <div className={`member-brand-lockup${reducedMotion ? " reduced-motion" : ""}`}>
      <div className="member-brand-copy" aria-hidden={!revealFirstLine && !revealSecondLine}>
        <span className={revealFirstLine ? "revealed" : ""}>기록하고</span>
        <span className={revealSecondLine ? "revealed" : ""}>표현하세요</span>
      </div>
      <Image
        className={`member-brand-logo${revealLogo ? " revealed" : ""}`}
        src="/auth/addi-logo.svg"
        alt="ADDI"
        width={154}
        height={62}
        priority
      />
    </div>
  );
}

type MemberSplashProps = {
  onComplete?: () => void;
};

export function MemberSplash({ onComplete }: MemberSplashProps) {
  const [variant, setVariant] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shouldReduceMotion = mediaQuery.matches;
    let alreadyShown = false;

    try {
      alreadyShown = window.sessionStorage.getItem(MEMBER_SPLASH_SESSION_KEY) === "1";
    } catch {
      // If sessionStorage is unavailable, replaying the splash is the safe fallback.
    }

    if (alreadyShown || shouldReduceMotion) {
      setReducedMotion(shouldReduceMotion);
      setVariant(3);
      try {
        window.sessionStorage.setItem(MEMBER_SPLASH_SESSION_KEY, "1");
        window.sessionStorage.setItem(LEGACY_HOME_SPLASH_SESSION_KEY, "1");
        document.documentElement.dataset.addiMemberSplash = "skip";
      } catch {
        // The final reduced-motion state does not depend on storage.
      }
      onComplete?.();
      return;
    }

    const timers = SPLASH_STEPS.map(({ at, variant: nextVariant }) => (
      window.setTimeout(() => setVariant(nextVariant), at)
    ));
    timers.push(window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(MEMBER_SPLASH_SESSION_KEY, "1");
        window.sessionStorage.setItem(LEGACY_HOME_SPLASH_SESSION_KEY, "1");
        document.documentElement.dataset.addiMemberSplash = "skip";
      } catch {
        // The completed visual can still continue when storage is unavailable.
      }
      onComplete?.();
    }, SPLASH_COMPLETE_MS));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [onComplete]);

  return (
    <main className="member-splash" aria-label="ADDI 시작 중" aria-busy="true">
      <MemberBrandLockup
        revealFirstLine={variant >= 1}
        revealSecondLine={variant >= 2}
        revealLogo={variant >= 3}
        reducedMotion={reducedMotion}
      />
    </main>
  );
}
