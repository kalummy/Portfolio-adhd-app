import { Suspense } from "react";
import { AuthLoginScreen } from "@/components/auth-login-screen";
import { MemberSplash } from "@/components/member-splash";

export default function LoginPage() {
  return (
    <Suspense fallback={<MemberSplash />}>
      <AuthLoginScreen />
    </Suspense>
  );
}
