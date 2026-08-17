"use client";

import Image from "next/image";
import { useEffect } from "react";

type ToastProps = {
  message: string;
  onDismiss: () => void;
  aboveNavigation?: boolean;
};

export function Toast({ message, onDismiss, aboveNavigation = false }: ToastProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 3000);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  return (
    <div
      className={`app-toast ${aboveNavigation ? "above-navigation" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Image src="/icons/visit-toast-check.svg" alt="" width={20} height={20} />
      <span>{message}</span>
    </div>
  );
}
