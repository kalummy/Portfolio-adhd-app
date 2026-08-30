import { redirect } from "next/navigation";
import { connection } from "next/server";
import { MyHomeSocialLogin } from "@/components/my-home-social-login";
import { getCurrentUser } from "@/lib/auth/server";

export default async function MyHomeSocialLoginPage() {
  await connection();
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/my/social-login");

  return <MyHomeSocialLogin />;
}
