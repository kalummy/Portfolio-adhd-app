"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

type ToastProps = {
  message: string;
  onDismiss: () => void;
  aboveNavigation?: boolean;
  showIcon?: boolean;
};

export function Toast({
  message,
  onDismiss,
  aboveNavigation = false,
  showIcon = true,
}: ToastProps) {
  const messageRef = useRef<HTMLSpanElement>(null);
  const [isMultiline, setIsMultiline] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  useLayoutEffect(() => {
    const messageElement = messageRef.current;
    if (!messageElement) return;

    const measureLines = () => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(messageElement).lineHeight);
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;
      setIsMultiline(messageElement.scrollHeight > lineHeight + 1);
    };

    measureLines();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(measureLines);
    observer?.observe(messageElement);
    window.addEventListener("resize", measureLines);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measureLines);
    };
  }, [message, showIcon]);

  return (
    <div
      className={`app-toast ${isMultiline ? "multiline" : ""} ${aboveNavigation ? "above-navigation" : ""}`}
      role="status"
      aria-live="polite"
    >
      {showIcon ? (
        <Image src="/icons/visit-toast-check.svg" alt="" width={20} height={20} />
      ) : null}
      <span ref={messageRef}>{message}</span>
    </div>
  );
}
