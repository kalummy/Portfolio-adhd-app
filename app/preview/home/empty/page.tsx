import { HomeScreen } from "@/components/home-screen";
import {
  PREVIEW_EMPTY_HOME_DATA,
  PREVIEW_REFERENCE_DATE,
} from "@/lib/preview-home-fixture";

export default function EmptyPreviewHomePage() {
  return (
    <HomeScreen
      previewData={PREVIEW_EMPTY_HOME_DATA}
      referenceDateKey={PREVIEW_REFERENCE_DATE}
      initialDateKey={PREVIEW_REFERENCE_DATE}
      minimumDateKey={PREVIEW_REFERENCE_DATE}
      maximumDateKey={PREVIEW_REFERENCE_DATE}
    />
  );
}
