"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const MOOD_BOTTOM_SHEET_DURATION_MS = 280;

export function useMoodBottomSheet() {
  const closeTimerRef = useRef<number | null>(null);
  const enterFrameRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [entered, setEntered] = useState(false);

  const open = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);
    closingRef.current = false;
    setEntered(false);
    setMounted(true);
    enterFrameRef.current = window.requestAnimationFrame(() => {
      enterFrameRef.current = window.requestAnimationFrame(() => setEntered(true));
    });
  }, []);

  const close = useCallback((afterClose?: () => void) => {
    if (closingRef.current) return;
    closingRef.current = true;
    if (enterFrameRef.current !== null) {
      window.cancelAnimationFrame(enterFrameRef.current);
      enterFrameRef.current = null;
    }

    const finish = () => {
      afterClose?.();
      setEntered(false);
      setMounted(false);
      closingRef.current = false;
      closeTimerRef.current = null;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    setEntered(false);
    closeTimerRef.current = window.setTimeout(finish, MOOD_BOTTOM_SHEET_DURATION_MS);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [close, mounted]);

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    if (enterFrameRef.current !== null) window.cancelAnimationFrame(enterFrameRef.current);
  }, []);

  return { mounted, entered, open, close };
}
