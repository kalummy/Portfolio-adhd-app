import Script from "next/script";
import { homeToastProps } from "@/lib/navigation-toast";
import { HomeScreen } from "@/components/home-screen";
import { isValidDateKey } from "@/lib/kst-date";

const SPLASH_PREPAINT_SCRIPT = `try{if(sessionStorage.getItem("addi:splash:shown:v1")==="1"){document.documentElement.dataset.addiSplash="skip"}else{document.documentElement.removeAttribute("data-addi-splash")}}catch{}`;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    medicationToast?: string;
    toastId?: string;
    moodToast?: string;
    visitToast?: string;
    feedbackToast?: string;
    date?: string | string[];
  }>;
}) {
  const { medicationToast, toastId, moodToast, visitToast, feedbackToast, date } = await searchParams;
  const requestedDate = Array.isArray(date) ? date[0] : date;
  const toastParams = new URLSearchParams();
  for (const [key, value] of Object.entries({ medicationToast, moodToast, visitToast, feedbackToast, toastId })) {
    if (value) toastParams.set(key, value);
  }
  return (
    <>
      <Script id="addi-splash-prepaint">{SPLASH_PREPAINT_SCRIPT}</Script>
      <HomeScreen
        initialDateKey={isValidDateKey(requestedDate) ? requestedDate : undefined}
        enableLaunchSplash={!medicationToast && !moodToast && !feedbackToast}
        {...homeToastProps(toastParams)}
      />
    </>
  );
}
