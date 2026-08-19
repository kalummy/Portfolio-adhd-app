import { HomeScreen } from "@/components/home-screen";

const SPLASH_PREPAINT_SCRIPT = `try{if(sessionStorage.getItem("addi:splash:shown:v1")==="1"){document.documentElement.dataset.addiSplash="skip"}else{document.documentElement.removeAttribute("data-addi-splash")}}catch{}`;

const TOAST_MESSAGES: Record<string, string> = {
  added: "내원일정을 추가했어요.",
  deleted: "내원일정을 삭제했어요.",
};

const MOOD_TOAST_MESSAGES: Record<string, string> = {
  saved: "감정기록 완료!\n오늘도 고생 많으셨어요 🩷",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ moodToast?: string; visitToast?: string }>;
}) {
  const { moodToast, visitToast } = await searchParams;
  const initialToast = moodToast
    ? MOOD_TOAST_MESSAGES[moodToast]
    : visitToast
      ? TOAST_MESSAGES[visitToast]
      : undefined;
  const initialToastQueryKey = moodToast
    ? "moodToast" as const
    : visitToast
      ? "visitToast" as const
      : undefined;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_PREPAINT_SCRIPT }} />
      <HomeScreen
        enableLaunchSplash={!moodToast}
        initialToast={initialToast}
        initialToastQueryKey={initialToastQueryKey}
      />
    </>
  );
}
