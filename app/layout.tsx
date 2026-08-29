import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Suspense } from "react";
import { AnalyticsAuthCompletion } from "@/components/analytics-auth-completion";
import { AnalyticsScreenTracker } from "@/components/analytics-screen-tracker";
import { MemberEntryGate } from "@/components/member-entry-gate";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

const MEMBER_SPLASH_PREPAINT_SCRIPT = `try{if(sessionStorage.getItem("addi:member-splash:shown:v1")==="1"){document.documentElement.dataset.addiMemberSplash="skip"}else{document.documentElement.removeAttribute("data-addi-member-splash")}}catch{}`;

export const metadata: Metadata = {
  title: "ADDI",
  description: "복용약과 상태를 기록하는 ADDI",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fafafb",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <Script id="addi-member-splash-prepaint" strategy="beforeInteractive">
          {MEMBER_SPLASH_PREPAINT_SCRIPT}
        </Script>
        <AnalyticsAuthCompletion />
        <Suspense fallback={null}>
          <AnalyticsScreenTracker />
        </Suspense>
        <MemberEntryGate>{children}</MemberEntryGate>
      </body>
    </html>
  );
}
