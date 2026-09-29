import { useEffect, useState } from 'react';
import { MemberBrandLockup, SPLASH_COMPLETE_MS, SPLASH_STEPS } from '@/components/member-splash';
import { MobileShell } from '@/components/mobile-shell';
import { markNative } from '../platform/performance';

/** Figma 31:511 motion in the authenticated 506:11332 layout. */
export function NativeRestoringScreen({ visible, complete, onComplete }: {
  visible: boolean;
  complete: boolean;
  onComplete: () => void;
}) {
  const [variant, setVariant] = useState(complete ? 3 : 0);
  useEffect(() => {
    if (!visible || complete) return;
    // Start after the OS splash is hidden, so none of the Figma sequence is lost.
    markNative('splash.motion.start');
    const timers = SPLASH_STEPS.map(({ at, variant: next }) => window.setTimeout(() => {
      setVariant(next);
    }, at));
    timers.push(window.setTimeout(() => {
      markNative('splash.motion.complete');
      onComplete();
    }, SPLASH_COMPLETE_MS));
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [visible, complete, onComplete]);

  return <MobileShell className="member-login-screen native-restoring-screen" aria-label="ADDI 시작 중" aria-busy="true">
    <MemberBrandLockup
      revealFirstLine={complete || variant >= 1}
      revealSecondLine={complete || variant >= 2}
      revealLogo={complete || variant >= 3}
    />
  </MobileShell>;
}
