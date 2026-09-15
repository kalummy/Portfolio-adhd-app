import { useEffect } from 'react';
import { HomeScreen } from '@/components/home-screen';
import MedicationListPage from '../../../app/medications/page';
import VisitListPage from '../../../app/visits/page';
import { VisitCalendarScreen } from '@/components/visit-calendar-screen';
import { MoodHistory } from '@/components/mood-history';
import { MoodQuestionFlow } from '@/components/mood-question-flow';
import { MoodRecordDetail } from '@/components/mood-record-detail';
import { NOTIFICATION_PREVIEW_ITEMS, NOTIFICATION_PREVIEW_NOW } from '@/lib/preview-notifications-fixture';
import { NotificationsScreen } from '@/components/notifications-screen';
import { MyHomeScreen } from '@/components/my-home-screen';
import { MedicationScheduleEditor } from '@/components/medication-schedule-editor';
import { FlowHeader } from '@/components/flow-ui';
import { MobileShell } from '@/components/mobile-shell';
import { DEFAULT_ADDI_PROFILE_ID } from '@/lib/profile';
import { getKstDateKey, isValidDateKey } from '@/lib/kst-date';
import { useLocation } from './platform/router';
import { dismissNativeSplash } from './platform/lifecycle';

function Placeholder({ phase }: { phase: number }) {
  return <MobileShell className="flow-screen visit-list-screen"><FlowHeader title="준비 중인 기능" fallbackHref="/" /><section className="visit-list-content"><div className="visit-list-title"><h1>Phase {phase}에서 연결할 기능이에요</h1><p>이 앱은 화면 검증용 프로토타입이에요.</p></div></section></MobileShell>;
}
export function NativeApp() {
  const current = useLocation();
  const [path, query] = current.split('?');
  const requested = new URLSearchParams(query).get('date') ?? undefined;
  const date = isValidDateKey(requested) ? requested : getKstDateKey();
  useEffect(() => { void dismissNativeSplash(); }, []);
  let screen;
  if (path === '/') screen = <HomeScreen enableLaunchSplash={false} />;
  else if (path === '/medications') screen = <MedicationListPage />;
  else if (/^\/medications\/[^/]+\/schedule$/.test(path)) screen = <MedicationScheduleEditor medicationId={decodeURIComponent(path.split('/')[2])} targetDateKey={date} />;
  else if (path === '/moods') screen = <MoodHistory />;
  else if (path === '/moods/new') screen = <MoodQuestionFlow targetDateKey={date} lottieAvailability={{ complete: true }} />;
  else if (/^\/moods\/\d{4}-\d{2}-\d{2}$/.test(path)) screen = <MoodRecordDetail dateKey={path.split('/')[2]} />;
  else if (path === '/visits') screen = <VisitListPage />;
  else if (path === '/visits/new' || path === '/visits/edit') screen = <VisitCalendarScreen mode={path.endsWith('/new') ? 'new' : 'edit'} />;
  else if (path === '/notifications') screen = <NotificationsScreen initialNotifications={NOTIFICATION_PREVIEW_ITEMS} referenceNow={NOTIFICATION_PREVIEW_NOW} initialPushState="subscribed" />;
  else if (path === '/my') screen = <MyHomeScreen displayName="프로토타입" userId="native-fixture-user" initialProfileId={DEFAULT_ADDI_PROFILE_ID} />;
  else screen = <Placeholder phase={path.startsWith('/notifications') ? 3 : 2} />;
  return <div key={path} data-native-route={path}>{screen}</div>;
}
