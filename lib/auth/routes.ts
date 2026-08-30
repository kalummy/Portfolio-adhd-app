export const MEMBER_SPLASH_SESSION_KEY = "addi:member-splash:shown:v1";
export const LEGACY_HOME_SPLASH_SESSION_KEY = "addi:splash:shown:v1";

const PUBLIC_PAGE_PATHS = ["/auth", "/privacy", "/terms", "/delete-account"] as const;
const PUBLIC_METADATA_PATHS = [
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
] as const;
const SELF_AUTHENTICATING_API_PATHS = ["/api/account"] as const;
const PUBLIC_VERSION_API_PATHS = ["/api/app-version"] as const;

function matchesPathPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPagePath(pathname: string) {
  return PUBLIC_PAGE_PATHS.some((prefix) => matchesPathPrefix(pathname, prefix));
}

export function isPublicRequestPath(pathname: string) {
  return isPublicPagePath(pathname)
    || PUBLIC_METADATA_PATHS.includes(pathname as (typeof PUBLIC_METADATA_PATHS)[number])
    || SELF_AUTHENTICATING_API_PATHS.includes(
      pathname as (typeof SELF_AUTHENTICATING_API_PATHS)[number],
    )
    || PUBLIC_VERSION_API_PATHS.includes(
      pathname as (typeof PUBLIC_VERSION_API_PATHS)[number],
    );
}
