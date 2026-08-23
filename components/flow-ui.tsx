"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type FlowHeaderProps = {
  title?: string;
  fallbackHref?: string;
  beforeBack?: () => void;
  onBack?: () => void;
  onClose?: () => void;
  onBackOnly?: boolean;
};

export function FlowHeader({ title, fallbackHref, beforeBack, onBack, onClose, onBackOnly = false }: FlowHeaderProps) {
  const router = useRouter();

  function goBack() {
    if (onBack) {
      onBack();
      return;
    }
    beforeBack?.();

    if (onBackOnly) return;

    if (fallbackHref) {
      router.replace(fallbackHref);
      return;
    }

    router.back();
  }

  return (
    <header className="flow-header">
      <button className="icon-button" type="button" onClick={goBack} aria-label="이전 화면">
        <Image src="/icons/back.svg" alt="" width={18} height={14} />
      </button>
      {title ? <strong>{title}</strong> : null}
      {onClose ? (
        <button className="icon-button flow-header-close" type="button" onClick={onClose} aria-label="감정 기록 닫기">
          <Image src="/icons/close.svg" alt="" width={16} height={16} />
        </button>
      ) : null}
    </header>
  );
}

export function BottomActions({ children }: { children: ReactNode }) {
  return (
    <div className="bottom-actions">
      <div className="bottom-actions-inner">{children}</div>
    </div>
  );
}

type PrimaryButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "soft" | "secondary";
};

export function PrimaryButton({ variant = "primary", className = "", ...props }: PrimaryButtonProps) {
  return <button className={`primary-button ${variant} ${className}`} {...props} />;
}
