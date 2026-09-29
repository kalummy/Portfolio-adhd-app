import { trackScreenViewed } from './adapters/analytics';
import { MedicationMethodScreen } from '@/components/medication-method-screen';
import { MedicationScheduleEditor } from '@/components/medication-schedule-editor';
import { VisitCalendarScreen } from '@/components/visit-calendar-screen';
import PrivacyPage from '../../../app/privacy/page';
import TermsPage from '../../../app/terms/page';
import { PublicAccountDeletion } from '@/components/public-account-deletion';
import { MyHomeSocialLogin } from '@/components/my-home-social-login';
import { MyHomeDeleteAccount } from '@/components/my-home-delete-account';
import { isValidDateKey } from '@/lib/kst-date';
import SearchPage from '../../../app/medications/new/search/page';
import ReviewPage from '../../../app/medications/new/review/page';
import SchedulePage from '../../../app/medications/new/schedule/page';
import ConfirmPage from '../../../app/medications/new/confirm/page';
import CompletePage from '../../../app/medications/new/complete/page';
import NoticePage from '../../../app/medications/new/notice/page';
import ManualNamePage from '../../../app/medications/new/manual/name/page';
import ManualStrengthPage from '../../../app/medications/new/manual/strength/page';
import PhotoPage from '../../../app/medications/new/photo/page';
import PhotoResultPage from '../../../app/medications/new/photo/result/page';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { nativeMoodDrafts } from './api/mood-draft-store';
import { HomeScreen } from '@/components/home-screen';
import { MedicationListContent } from '@/components/medication-list-screen';
import VisitListPage from '../../../app/visits/page';
import { MoodQuestionFlow } from '@/components/mood-question-flow';
import { getKstDateKey } from '@/lib/kst-date';
import { MoodHistory } from '@/components/mood-history';
import { MoodRecordDetail } from '@/components/mood-record-detail';
import { NotificationSettingsScreen } from '@/components/notification-settings-screen';
import { NativePushQaScreen } from './push/qa-screen';
import { nativeConfig } from './auth/client';
import { NotificationsScreen } from '@/components/notifications-screen';
import { MyHomeScreen } from '@/components/my-home-screen';
import { FlowHeader } from '@/components/flow-ui';
import { MobileShell } from '@/components/mobile-shell';
import { getAddiProfileId } from '@/lib/profile';
import { getUserDisplayName } from '@/lib/auth/display-name';
import { getNativeAuthSnapshot, subscribeNativeAuth } from './auth/runtime';
import { NativeLoginScreen } from './auth/login-screen';
import { NativeRestoringScreen } from './auth/restoring-screen';
import { homeToastProps } from '@/lib/navigation-toast';
import { useLocation } from './platform/router';
import { dismissNativeSplash } from './platform/lifecycle';
import { prefetchNativeHome } from './adapters/repositories';

function Placeholder({ phase }: { phase: number }) {
  return <MobileShell className="flow-screen visit-list-screen"><FlowHeader title="준비 중인 기능" fallbackHref="/" /><section className="visit-list-content"><div className="visit-list-title"><h1>Phase {phase}에서 연결할 기능이에요</h1><p>이 앱은 화면 검증용 프로토타입이에요.</p></div></section></MobileShell>;
}
export function NativeApp() {
  const current = useLocation();
  const path = current.split('?')[0];
  const params = new URLSearchParams(current.split('?')[1] ?? '');
  const requestedDate = params.get('date') ?? undefined;
  const date = isValidDateKey(requestedDate) ? requestedDate : undefined;
  const dateQuery = date ? `?date=${encodeURIComponent(date)}` : '';
  const medicationSchedule = /^\/medications\/([^/]+)\/schedule$/.exec(path);
  const [splashVisible, setSplashVisible] = useState(false);
  const [splashComplete, setSplashComplete] = useState(false);
  const completeSplash = useCallback(() => setSplashComplete(true), []);
  useEffect(() => {
    let active = true;
    void dismissNativeSplash().then(() => { if (active) setSplashVisible(true); });
    return () => { active = false; };
  }, []);
  const auth = useSyncExternalStore(subscribeNativeAuth, getNativeAuthSnapshot);
  const draftStorage = useMemo(() => nativeMoodDrafts.storage(auth.user?.id ?? ''), [auth.user?.id]);
  useEffect(() => {
    if (auth.status === 'starting' || auth.status === 'completing' || (auth.status === 'signed_in' && !splashComplete)) return;
    const publicDocument = ['/privacy', '/terms', '/delete-account'].includes(path);
    trackScreenViewed(!auth.user && !publicDocument ? '/auth/login' : path);
  }, [auth.status, auth.user?.id, path, splashComplete]);
  useEffect(() => {
    if (auth.status === 'signed_in' && auth.user && path === '/' && !splashComplete) {
      void prefetchNativeHome().catch(() => undefined);
    }
  }, [auth.status, auth.user?.id, path, splashComplete]);
  if (auth.status === 'starting' || auth.status === 'completing'
    || (auth.status === 'signed_in' && !splashComplete)) {
    return <NativeRestoringScreen visible={splashVisible} complete={splashComplete} onComplete={completeSplash} />;
  }
  // Reuse the public Web content verbatim, including before authentication.
  if (path === '/privacy') return <PrivacyPage />;
  if (path === '/terms') return <TermsPage />;
  if (path === '/delete-account') return <PublicAccountDeletion configured isAuthenticated={auth.status === 'signed_in' && Boolean(auth.user)} />;
  if (!auth.user || auth.status !== 'signed_in') return <NativeLoginScreen />;
  let screen;
  if (path === '/') screen = <HomeScreen initialDateKey={date} initialAuthState={{ isAuthenticated: true, user: auth.user }} enableLaunchSplash={false} {...homeToastProps(params)} />;
  else if (path === '/medications') screen = <MedicationListContent />;
  else if (path === '/medications/new') screen = <MedicationMethodScreen returnHref={`${params.get('origin') === 'medications' ? '/medications' : '/'}${dateQuery}`} />;
  else if (path === '/medications/new/search') screen = <SearchPage />;
  else if (path === '/medications/new/review') screen = <ReviewPage />;
  else if (path === '/medications/new/schedule') screen = <SchedulePage />;
  else if (path === '/medications/new/confirm') screen = <ConfirmPage />;
  else if (path === '/medications/new/complete') screen = <CompletePage />;
  else if (path === '/medications/new/notice') screen = <NoticePage />;
  else if (path === '/medications/new/manual/name') screen = <ManualNamePage />;
  else if (path === '/medications/new/manual/strength') screen = <ManualStrengthPage />;
  else if (path === '/medications/new/photo') screen = <PhotoPage />;
  else if (path === '/medications/new/photo/result') screen = <PhotoResultPage />;
  else if (medicationSchedule) screen = <MedicationScheduleEditor key={current} medicationId={decodeURIComponent(medicationSchedule[1])} targetDateKey={date} returnHref={`/medications${dateQuery}`} homeHref={`/${dateQuery}`} />;
  else if (path === '/visits/new' || path === '/visits/edit') screen = <VisitCalendarScreen mode={path.endsWith('/edit') ? 'edit' : 'new'} />;
  else if (path === '/my/social-login') screen = <MyHomeSocialLogin key={current} initialError={params.has("linkError") ? "계정 연결을 시작하지 못했어요. 다시 시도해주세요." : ""} />;
  else if (path === '/my/delete-account') screen = <MyHomeDeleteAccount />;
  else if (path === '/moods/new') screen = <MoodQuestionFlow key={`${auth.user.id}:${date ?? getKstDateKey()}`} draftStorage={draftStorage} analysisRecovery targetDateKey={date ?? getKstDateKey()} lottieAvailability={{complete:true}} />;
  else if (path === '/moods') screen = <MoodHistory showDeletedToast={params.get('deleted') === '1'} />;
  else if (/^\/moods\/\d{4}-\d{2}-\d{2}$/.test(path)) screen = <MoodRecordDetail dateKey={path.split('/')[2]} />;
  else if (path === '/visits') screen = <VisitListPage />;
  else if (path === '/notifications') screen = <NotificationsScreen />;
  else if (path === '/notifications/settings') screen = <><NotificationSettingsScreen />{nativeConfig?.stage === 'development' && <div style={{maxWidth:430,margin:'0 auto',padding:'16px 20px'}}><a href="/dev/push">Dev 알림 테스트</a></div>}</>;
  else if (path === '/dev/push') screen = nativeConfig?.stage === 'development' ? <NativePushQaScreen /> : <NotificationSettingsScreen />;
  else if (path === '/my') screen = <MyHomeScreen displayName={getUserDisplayName(auth.user)} userId={auth.user.id} initialProfileId={getAddiProfileId(auth.user)} />;
  else screen = <Placeholder phase={path.startsWith('/notifications') ? 3 : 2} />;
  return <div key={`${auth.user.id}:${path}`} data-native-route={path}>{screen}</div>;
}
