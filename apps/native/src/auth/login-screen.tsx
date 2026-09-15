import { useSyncExternalStore } from 'react';
import { MemberBrandLockup } from '@/components/member-splash';
import { MobileShell } from '@/components/mobile-shell';
import { cancelNativeLogin, getNativeAuthSnapshot, signInNative, subscribeNativeAuth } from './runtime';
export function NativeLoginScreen() {
  const auth = useSyncExternalStore(subscribeNativeAuth, getNativeAuthSnapshot);
  const busy = ['starting', 'pending', 'completing'].includes(auth.status);
  return <MobileShell className="member-login-screen">
    <MemberBrandLockup />
    <div className="member-login-actions">
      {auth.message && <p className="member-login-error" role="status">{auth.message}</p>}
      {(['kakao', 'google'] as const).map(provider => <button type="button" key={provider}
        className={`member-login-button ${provider}`} disabled={busy || auth.status === 'unavailable'}
        onClick={() => { void signInNative(provider).catch(() => undefined); }}>
        <img src={`/auth/${provider}.svg`} alt="" width={40} height={40} />
        <span>{provider === 'kakao' ? '카카오로 시작' : '구글로 시작'}</span>
      </button>)}
      {auth.status === 'pending' && <button type="button" className="member-login-button" onClick={() => { void cancelNativeLogin(); }}>로그인 취소</button>}
      {auth.status === 'completing' && <p role="status">로그인을 완료하고 있어요.</p>}
    </div>
  </MobileShell>;
}
