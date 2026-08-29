import Image from "next/image";
import Link from "next/link";

type BottomNavigationProps = {
  activeTab: "home" | "moods";
};

export function BottomNavigation({ activeTab }: BottomNavigationProps) {
  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴">
      <div className="bottom-navigation-tabs">
        <Link
          href="/"
          className={`bottom-navigation-tab${activeTab === "home" ? " active" : ""}`}
          aria-current={activeTab === "home" ? "page" : undefined}
        >
          <span className="bottom-navigation-icon bottom-navigation-home-icon" aria-hidden="true">
            <Image
              src={activeTab === "home" ? "/icons/nav-home.svg" : "/icons/nav-home-inactive.svg"}
              alt=""
              width={23}
              height={23}
            />
          </span>
          <span>홈</span>
        </Link>
        <Link
          href="/moods"
          className={`bottom-navigation-tab${activeTab === "moods" ? " active" : ""}`}
          aria-current={activeTab === "moods" ? "page" : undefined}
        >
          <span className="bottom-navigation-icon" aria-hidden="true">
            <Image
              src={activeTab === "moods" ? "/icons/nav-heart-active.svg" : "/icons/nav-heart.svg"}
              alt=""
              width={28}
              height={28}
            />
          </span>
          <span>감정기록</span>
        </Link>
        <span className="bottom-navigation-tab unavailable" aria-disabled="true">
          <span className="bottom-navigation-icon bottom-navigation-focus-icon" aria-hidden="true">
            <Image src="/icons/nav-clock.svg" alt="" width={28} height={28} />
          </span>
          <span>집중</span>
        </span>
        <span className="bottom-navigation-tab unavailable" aria-disabled="true">
          <span className="bottom-navigation-icon" aria-hidden="true">
            <Image src="/icons/random-profile-28.svg" alt="" width={28} height={28} />
          </span>
          <span>마이홈</span>
        </span>
      </div>
    </nav>
  );
}
