import { Suspense } from "react";
import { AuthLoginScreen } from "@/components/auth-login-screen";
import { MobileShell } from "@/components/mobile-shell";

export default function LoginPage() {
  return (
    <Suspense fallback={<MobileShell className="flow-screen auth-screen">{null}</MobileShell>}>
      <AuthLoginScreen />
    </Suspense>
  );
}
