import type { HTMLAttributes, ReactNode } from "react";

type MobileShellProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
};

export function MobileShell({ children, className = "", ...props }: MobileShellProps) {
  return (
    <main className={`mobile-shell ${className}`} {...props}>
      {children}
    </main>
  );
}
