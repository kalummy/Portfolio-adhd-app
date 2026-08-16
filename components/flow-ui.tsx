"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function FlowHeader({ title }: { title?: string }) {
  const router = useRouter();
  return (
    <header className="flow-header">
      <button className="icon-button" type="button" onClick={() => router.back()} aria-label="이전 화면">
        <Image src="/icons/back.svg" alt="" width={18} height={14} />
      </button>
      {title ? <strong>{title}</strong> : null}
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
