export function isAnalyticsPathBlocked(pathname: string) {
  return pathname === "/preview" || pathname.startsWith("/preview/");
}
