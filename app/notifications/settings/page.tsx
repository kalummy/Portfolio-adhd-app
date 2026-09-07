import { NotificationSettingsScreen } from "@/components/notification-settings-screen";
import { PushE2EButton } from "@/components/push-e2e-button";
import { getCurrentE2EOffer } from "@/lib/push/e2e-offer-server";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const offer = await getCurrentE2EOffer();
  return <NotificationSettingsScreen e2eAction={offer ? <PushE2EButton key={offer.runId} offer={offer} /> : null} />;
}
