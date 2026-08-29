import type { User } from "@supabase/supabase-js";

export function getUserDisplayName(user: User) {
  const metadata = user.user_metadata;
  const candidates = [metadata?.full_name, metadata?.name, metadata?.nickname];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const name = candidate.trim();
    if (name) return name;
  }

  const emailName = user.email?.split("@", 1)[0]?.trim();
  return emailName || "ADDI 회원";
}
