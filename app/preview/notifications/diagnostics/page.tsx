import { notFound } from "next/navigation";
import { PushDiagnosticsScreen } from "@/components/push-diagnostics-screen";
import {
  isNotificationPreviewEnvironment,
  isNotificationPushTestEnvironment,
} from "@/lib/preview-environment";

export default function PreviewPushDiagnosticsPage() {
  if (!isNotificationPreviewEnvironment()) notFound();

  return (
    <PushDiagnosticsScreen
      providerTestEnabled={isNotificationPushTestEnvironment()}
    />
  );
}
