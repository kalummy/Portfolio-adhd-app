import type { ReactNode } from "react";

export function MobileShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`mobile-shell ${className}`}>
      {children}
    </main>
  );
}
