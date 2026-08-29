import { redirect } from "next/navigation";
import { connection } from "next/server";
import { MyHomeDeleteAccount } from "@/components/my-home-delete-account";
import { getCurrentUser } from "@/lib/auth/server";

export default async function MyHomeDeleteAccountPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/my/delete-account");

  return <MyHomeDeleteAccount />;
}
