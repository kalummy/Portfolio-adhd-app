import { Capacitor, registerPlugin } from '@capacitor/core';
const haptics = registerPlugin<{ selection(): Promise<void> }>('AddiNavigationHaptics');
let lastSelection = -Infinity;
export function navigationHaptic(selected: boolean) {
  if (selected || !Capacitor.isNativePlatform()) return;
  const now = performance.now();
  if (now - lastSelection < 120) return;
  lastSelection = now;
  void haptics.selection().catch(() => undefined);
}
