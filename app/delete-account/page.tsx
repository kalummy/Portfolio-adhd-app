import type { Metadata } from "next";
import { connection } from "next/server";
import { PublicAccountDeletion } from "@/components/public-account-deletion";
import { getCurrentUser } from "@/lib/auth/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = {
  title: "ADDI 계정 삭제",
  description: "ADDI 계정과 연결된 데이터의 삭제 방법을 안내하고 삭제 절차를 제공합니다.",
};

export default async function DeleteAccountPage() {
  await connection();

  const configured = isSupabaseConfigured();
  const user = configured ? await getCurrentUser().catch(() => null) : null;

  return (
    <PublicAccountDeletion
      configured={configured}
      isAuthenticated={Boolean(user)}
    />
  );
}
