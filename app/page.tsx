import { HomeScreen } from "@/components/home-screen";

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
  return <HomeScreen initialVisitToast={visitToast ? TOAST_MESSAGES[visitToast] : undefined} />;
}
