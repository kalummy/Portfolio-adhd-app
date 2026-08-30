import Script from "next/script";
import { HomeScreen } from "@/components/home-screen";

const SPLASH_PREPAINT_SCRIPT = `try{if(sessionStorage.getItem("addi:splash:shown:v1")==="1"){document.documentElement.dataset.addiSplash="skip"}else{document.documentElement.removeAttribute("data-addi-splash")}}catch{}`;

const TOAST_MESSAGES: Record<string, string> = {
  added: "내원일정을 추가했어요.",
  deleted: "내원일정을 삭제했어요.",
};

const MOOD_TOAST_MESSAGES: Record<string, string> = {
  saved: "감정기록 완료!\n오늘도 고생 많으셨어요 🩷",
};

const MEDICATION_TOAST_MESSAGES: Record<string, string> = {
  added: "약을 등록했어요!",
  "schedule-updated": "복용 일정을 수정했어요.",
  "time-updated": "복용 시간을 수정했어요.",
};

const FEEDBACK_TOAST_MESSAGES: Record<string, string> = {
  sent: "소중한 의견을 남겨주셔서 감사드려요  🙌",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    medicationToast?: string;
    toastId?: string;
    moodToast?: string;
    visitToast?: string;
    feedbackToast?: string;
  }>;
}) {
  const { medicationToast, toastId, moodToast, visitToast, feedbackToast } = await searchParams;
  const initialToast = medicationToast
    ? medicationToast === "added" && !toastId
      ? undefined
      : MEDICATION_TOAST_MESSAGES[medicationToast]
    : moodToast
      ? MOOD_TOAST_MESSAGES[moodToast]
      : visitToast
        ? TOAST_MESSAGES[visitToast]
        : feedbackToast
          ? FEEDBACK_TOAST_MESSAGES[feedbackToast]
          : undefined;
  const initialToastQueryKey = medicationToast
    ? "medicationToast" as const
    : moodToast
      ? "moodToast" as const
      : visitToast
        ? "visitToast" as const
        : feedbackToast
          ? "feedbackToast" as const
          : undefined;
  return (
    <>
      <Script id="addi-splash-prepaint">{SPLASH_PREPAINT_SCRIPT}</Script>
      <HomeScreen
        enableLaunchSplash={!medicationToast && !moodToast && !feedbackToast}
        initialToast={initialToast}
        initialToastId={
          medicationToast === "added" || moodToast === "saved" || feedbackToast === "sent"
            ? toastId
            : undefined
        }
        initialToastQueryKey={initialToastQueryKey}
      />
    </>
  );
}
