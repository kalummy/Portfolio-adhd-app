import Link from "next/link";

const TABS = [
  { id: "home", href: "/", label: "홈", icon: "home" },
  { id: "moods", href: "/moods", label: "기록", icon: "heart" },
  { id: "focus", href: "/focus", label: "집중", icon: "timer" },
  { id: "settings", href: "/settings", label: "설정", icon: "settings" },
] as const;

export type AppTabId = (typeof TABS)[number]["id"];

export function AppTabBar({ active }: { active: AppTabId }) {
  return (
    <nav className="app-tab-bar" aria-label="주요 메뉴">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={isActive ? "active" : undefined}
            aria-current={isActive ? "page" : undefined}
          >
            <span className={`app-tab-icon app-tab-icon-${tab.icon}`} aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
