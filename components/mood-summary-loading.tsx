import Image from "next/image";
import { MobileShell } from "@/components/mobile-shell";

const SUMMARY_POSES = [
  "/moods/summary-pose-1.png",
  "/moods/summary-pose-2.png",
  "/moods/summary-pose-3.png",
  "/moods/summary-pose-4.png",
];

export function MoodSummaryLoading({ targetDateLabel }: { targetDateLabel: string }) {
  return (
    <MobileShell className="mood-summary-screen" aria-live="polite" aria-busy="true">
      <span className="mood-target-date mood-summary-target-date">{targetDateLabel} 기록</span>
      <h1>
        <span>{targetDateLabel}의 감정기록을 정리하고 있어요</span>
        <span>잠시만 기다려주세요</span>
      </h1>
      <div className="mood-summary-animation" aria-hidden="true">
        {SUMMARY_POSES.map((src, index) => (
          <Image
            className={`mood-summary-pose pose-${index + 1}`}
            src={src}
            alt=""
            width={200}
            height={200}
            priority
            key={src}
          />
        ))}
      </div>
    </MobileShell>
  );
}
