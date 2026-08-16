import { HomeScreen } from "@/components/home-screen";
import {
  PREVIEW_HOME_DATA,
  PREVIEW_REFERENCE_DATE,
} from "@/lib/preview-home-fixture";

export default function PreviewHomePage() {
  return (
    <HomeScreen
      previewData={PREVIEW_HOME_DATA}
      referenceDateKey={PREVIEW_REFERENCE_DATE}
      initialDateKey={PREVIEW_REFERENCE_DATE}
    />
  );
}
