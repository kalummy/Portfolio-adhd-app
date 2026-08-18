import { HomeScreen } from "@/components/home-screen";

const SPLASH_PREPAINT_SCRIPT = `try{if(sessionStorage.getItem("addi:splash:shown:v1")==="1"){document.documentElement.dataset.addiSplash="skip"}else{document.documentElement.removeAttribute("data-addi-splash")}}catch{}`;

const TOAST_MESSAGES: Record<string, string> = {
  added: "내원일정을 추가했어요.",
  deleted: "내원일정을 삭제했어요.",
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ visitToast?: string }>;
}) {
  const { visitToast } = await searchParams;
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_PREPAINT_SCRIPT }} />
      <HomeScreen
        enableLaunchSplash
        initialVisitToast={visitToast ? TOAST_MESSAGES[visitToast] : undefined}
      />
    </>
  );
}
