import { isValidDateKey } from "./kst-date";

/** A Home context is a KST calendar key, never an instant to convert to UTC. */
export function readDateContext(search: string) {
  const date = new URLSearchParams(search).get("date") ?? undefined;
  return isValidDateKey(date) ? date : undefined;
}

export function withDateContext(path: string, date: string | undefined) {
  if (!isValidDateKey(date)) return path;
  const url = new URL(path, "https://addi.invalid");
  url.searchParams.set("date", date);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function dateContextHref(path: string) {
  if (typeof window === "undefined") return path;
  return withDateContext(path, readDateContext(window.location.search));
}
