import Image from "next/image";

type NavigationItemProps = {
  icon: string;
  iconClassName?: string;
  iconHeight?: number;
  iconWidth?: number;
  label: string;
  active?: boolean;
};

function NavigationItem({
  icon,
  iconClassName,
  iconHeight = 28,
  iconWidth = 28,
  label,
  active = false,
}: NavigationItemProps) {
  return (
    <button
      type="button"
      className={`bottom-navigation-item${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      <span className={`bottom-navigation-icon${iconClassName ? ` ${iconClassName}` : ""}`} aria-hidden="true">
        <Image src={icon} alt="" width={iconWidth} height={iconHeight} />
      </span>
      <span>{label}</span>
    </button>
  );
}

/** This release intentionally shows the Figma navigation as a visual footer only. */
export function BottomNavigation() {
  return (
    <nav className="bottom-navigation" aria-label="하단 탐색">
      <div className="bottom-navigation-items">
        <NavigationItem
          icon="/icons/nav-home.svg"
          iconClassName="bottom-navigation-home-icon"
          iconWidth={23}
          iconHeight={23}
          label="홈"
          active
        />
        <NavigationItem icon="/icons/nav-heart.svg" label="감정기록" />
        <NavigationItem
          icon="/icons/nav-clock.svg"
          iconClassName="bottom-navigation-focus-icon"
          iconWidth={20.4167}
          iconHeight={20.4167}
          label="집중"
        />
        <NavigationItem icon="/icons/random-profile-28.svg" label="마이홈" />
      </div>
    </nav>
  );
}
