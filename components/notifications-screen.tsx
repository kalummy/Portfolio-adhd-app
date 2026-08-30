"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { BottomNavigation } from "@/components/bottom-navigation";
import { MobileShell } from "@/components/mobile-shell";

export function NotificationsScreen() {
  const router = useRouter();

  return (
    <MobileShell className="notifications-screen">
      <header className="notifications-header">
        <button type="button" aria-label="이전 화면으로 돌아가기" onClick={() => router.back()}>
          <Image src="/icons/back.svg" alt="" width={24} height={24} />
        </button>
        <h1>알림</h1>
      </header>

      <section className="notifications-content" aria-label="알림 목록">
        <p className="sr-only">표시할 알림이 없습니다.</p>
      </section>

      <BottomNavigation activeTab="notifications" />
    </MobileShell>
  );
}
