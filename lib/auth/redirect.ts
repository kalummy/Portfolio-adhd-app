export function getSafeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  try {
    const baseUrl = new URL("https://addi.invalid");
    const destination = new URL(value, baseUrl);
    return destination.origin === baseUrl.origin ? value : "/";
  } catch {
    return "/";
  }
}
