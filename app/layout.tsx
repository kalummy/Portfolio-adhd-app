import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { AnalyticsAuthCompletion } from "@/components/analytics-auth-completion";
import { AnalyticsReplayController } from "@/components/analytics-replay-controller";
import { AnalyticsScreenTracker } from "@/components/analytics-screen-tracker";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

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
        <AnalyticsAuthCompletion />
        <Suspense fallback={null}>
          <AnalyticsReplayController />
          <AnalyticsScreenTracker />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
