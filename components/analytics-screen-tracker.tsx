"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackScreenViewed } from "@/lib/analytics/events";

export function AnalyticsScreenTracker() {
  const pathname = usePathname();

  useEffect(() => {
    trackScreenViewed(pathname);
  }, [pathname]);

  return null;
}
