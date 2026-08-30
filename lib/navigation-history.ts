type BackRouter = {
  back: () => void;
  replace: (href: string) => void;
};

const PENDING_BACK_TARGET_KEY = "addi:notification-back-target";
const CURRENT_BACK_TARGET_KEY = "addiNotificationBackTarget";

function routeFromHref(href: string) {
  const url = new URL(href, window.location.origin);
  return `${url.pathname}${url.search}`;
}

export function markNotificationNavigation(targetHref: string) {
  try {
    window.sessionStorage.setItem(PENDING_BACK_TARGET_KEY, routeFromHref(targetHref));
  } catch {
    // Navigation must continue even when session storage is unavailable.
  }
}

export function registerNotificationBackEntry(currentHref: string) {
  const currentRoute = routeFromHref(currentHref);
  const currentState = window.history.state;
  if (currentState && typeof currentState === "object"
    && currentState[CURRENT_BACK_TARGET_KEY] === currentRoute) {
    return true;
  }

  let pendingTarget: string | null = null;
  try {
    pendingTarget = window.sessionStorage.getItem(PENDING_BACK_TARGET_KEY);
    window.sessionStorage.removeItem(PENDING_BACK_TARGET_KEY);
  } catch {
    return false;
  }
  if (pendingTarget !== currentRoute) return false;

  try {
    window.history.replaceState({
      ...(currentState && typeof currentState === "object" ? currentState : {}),
      [CURRENT_BACK_TARGET_KEY]: currentRoute,
    }, "");
    return true;
  } catch {
    return false;
  }
}

export function navigateBackOrReplace(
  router: BackRouter,
  fallbackHref: string,
  hasBackEntry: boolean,
) {
  if (hasBackEntry) {
    router.back();
    return "back" as const;
  }

  router.replace(fallbackHref);
  return "replace" as const;
}
