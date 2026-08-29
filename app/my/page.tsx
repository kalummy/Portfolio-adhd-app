import { redirect } from "next/navigation";
import { connection } from "next/server";
import { MyHomeScreen } from "@/components/my-home-screen";
import { getUserDisplayName } from "@/lib/auth/display-name";
import { getCurrentUser } from "@/lib/auth/server";

export default async function MyHomePage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/my");

  return <MyHomeScreen displayName={getUserDisplayName(user)} userId={user.id} />;
}
