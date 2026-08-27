import Image from "next/image";
import Link from "next/link";
import { AppTabBar } from "@/components/app-tab-bar";
import { MobileShell } from "@/components/mobile-shell";

const SETTINGS_ITEMS = [
  { href: "/auth/login", label: "계정" },
  { href: "/feedback", label: "의견 보내기" },
  { href: "/terms", label: "서비스이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
] as const;

export default function SettingsPage() {
  return (
    <MobileShell className="settings-screen">
      <header className="settings-header">
        <strong>설정</strong>
      </header>
      <nav className="settings-list" aria-label="설정 메뉴">
        {SETTINGS_ITEMS.map((item) => (
          <Link href={item.href} key={item.href}>
            <span>{item.label}</span>
            <span className="settings-list-chevron" aria-hidden="true">
              <Image src="/icons/chevron-right.svg" alt="" width={12} height={6} />
            </span>
          </Link>
        ))}
      </nav>
      <AppTabBar active="settings" />
    </MobileShell>
  );
}
