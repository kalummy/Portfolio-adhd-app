import { useEffect, useSyncExternalStore } from 'react';
import { HomeScreen } from '@/components/home-screen';
import MedicationListPage from '../../../app/medications/page';
import VisitListPage from '../../../app/visits/page';
import { MoodHistory } from '@/components/mood-history';
import { MoodRecordDetail } from '@/components/mood-record-detail';
import { NotificationsScreen } from '@/components/notifications-screen';
import { MyHomeScreen } from '@/components/my-home-screen';
import { FlowHeader } from '@/components/flow-ui';
import { MobileShell } from '@/components/mobile-shell';
import { getAddiProfileId } from '@/lib/profile';
import { getUserDisplayName } from '@/lib/auth/display-name';
import { getNativeAuthSnapshot, subscribeNativeAuth } from './auth/runtime';
import { NativeLoginScreen } from './auth/login-screen';
import { useLocation } from './platform/router';
import { dismissNativeSplash } from './platform/lifecycle';

function Placeholder({ phase }: { phase: number }) {
  return <MobileShell className="flow-screen visit-list-screen"><FlowHeader title="준비 중인 기능" fallbackHref="/" /><section className="visit-list-content"><div className="visit-list-title"><h1>Phase {phase}에서 연결할 기능이에요</h1><p>이 앱은 화면 검증용 프로토타입이에요.</p></div></section></MobileShell>;
}
export function NativeApp() {
  const current = useLocation();
  const path = current.split('?')[0];
  useEffect(() => { void dismissNativeSplash(); }, []);
  const auth = useSyncExternalStore(subscribeNativeAuth, getNativeAuthSnapshot);
  if (!auth.user || auth.status !== 'signed_in') return <NativeLoginScreen />;
  let screen;
  if (path === '/') screen = <HomeScreen enableLaunchSplash={false} />;
  else if (path === '/medications') screen = <MedicationListPage />;
  else if (path === '/moods') screen = <MoodHistory />;
  else if (/^\/moods\/\d{4}-\d{2}-\d{2}$/.test(path)) screen = <MoodRecordDetail dateKey={path.split('/')[2]} />;
  else if (path === '/visits') screen = <VisitListPage />;
  else if (path === '/notifications') screen = <NotificationsScreen initialNotifications={[]} initialPushState="unsupported" />;
  else if (path === '/my') screen = <MyHomeScreen displayName={getUserDisplayName(auth.user)} userId={auth.user.id} initialProfileId={getAddiProfileId(auth.user)} />;
  else screen = <Placeholder phase={path.startsWith('/notifications') ? 3 : 2} />;
  return <div key={`${auth.user.id}:${path}`} data-native-route={path}>{screen}</div>;
}
