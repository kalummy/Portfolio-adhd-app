"use client";

import { useEffect } from "react";
import { getAuthState } from "@/lib/auth/client";
import { trackLoginCompleted } from "@/lib/analytics/events";
import { LOGIN_COMPLETED_QUERY_KEY } from "@/lib/analytics/schema";

export function AnalyticsAuthCompletion() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(LOGIN_COMPLETED_QUERY_KEY) !== "1") return;

    const removeCompletionMarker = () => {
      url.searchParams.delete(LOGIN_COMPLETED_QUERY_KEY);
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
    };

    void getAuthState()
      .then((state) => {
        if (state.isAuthenticated) trackLoginCompleted();
      })
      .catch(() => undefined)
      .finally(removeCompletionMarker);
  }, []);

  return null;
}
