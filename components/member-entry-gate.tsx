"use client";

import { useCallback, useLayoutEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { MemberSplash } from "@/components/member-splash";
import { isPublicPagePath, MEMBER_SPLASH_SESSION_KEY } from "@/lib/auth/routes";

export function MemberEntryGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = isPublicPagePath(pathname);
  const [splashSatisfied, setSplashSatisfied] = useState(false);

  useLayoutEffect(() => {
    if (isPublic || splashSatisfied) return;

    try {
      if (window.sessionStorage.getItem(MEMBER_SPLASH_SESSION_KEY) === "1") {
        document.documentElement.dataset.addiMemberSplash = "skip";
        setSplashSatisfied(true);
        return;
      }
    } catch {
      // Keep the splash visible when sessionStorage cannot be read.
    }

    document.documentElement.removeAttribute("data-addi-member-splash");
  }, [isPublic, pathname, splashSatisfied]);

  const handleComplete = useCallback(() => setSplashSatisfied(true), []);

  if (isPublic || splashSatisfied) return children;
  return <MemberSplash onComplete={handleComplete} />;
}
