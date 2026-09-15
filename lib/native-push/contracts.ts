export const DEV_PROJECT = "ohobxicxchkaisxxswkk";
export const DEV_SUPABASE = `https://${DEV_PROJECT}.supabase.co`;
export const DEV_FIREBASE = "addi-503b5";
export const NATIVE_PUSH_PATH = "/functions/v1/native-push";
export const KINDS = ["medication", "visit_day", "mood"] as const;
export type PreferenceKind = (typeof KINDS)[number];
export type Preferences = Record<PreferenceKind, boolean>;
export const DISABLED: Preferences = {
  medication: false,
  visit_day: false,
  mood: false,
};
export const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function isPreferences(value: unknown): value is Preferences {
  return (
    !!value &&
    typeof value === "object" &&
    Object.keys(value).length === 3 &&
    KINDS.every((k) => typeof (value as Preferences)[k] === "boolean")
  );
}
export function allowedRoute(
  route: unknown,
): route is "/" | "/moods/new" | "/visits" {
  return route === "/" || route === "/moods/new" || route === "/visits";
}
export type InstallationRequest = {
  installationId: string;
  secret: string;
  revision: number;
};
export type RegistrationRequest = InstallationRequest & {
  bindingId: string;
  token: string;
  appVersion: string;
  preferences: Preferences;
};
export function validInstallation(v: unknown): v is InstallationRequest {
  if (!v || typeof v !== "object") return false;
  const a = v as InstallationRequest;
  return (
    UUID.test(a.installationId) &&
    typeof a.secret === "string" &&
    /^[a-f0-9]{64}$/.test(a.secret) &&
    Number.isSafeInteger(a.revision) &&
    a.revision > 0
  );
}
export function validRegistration(v: unknown): v is RegistrationRequest {
  if (!validInstallation(v)) return false;
  const a = v as RegistrationRequest;
  return (
    UUID.test(a.bindingId) &&
    typeof a.token === "string" &&
    /^[A-Za-z0-9_:\-.]{20,4096}$/.test(a.token) &&
    typeof a.appVersion === "string" &&
    a.appVersion.length > 0 &&
    a.appVersion.length <= 80 &&
    isPreferences(a.preferences)
  );
}
export async function sha256(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
}
