import { App } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { hasNativeHistory, router } from './router';

let keyboardVisible = false;
/** UI-only diagnostics: no input values, health records, identifiers or transport. */
export const shellState = { starts: 1, resumes: 0, active: true, keyboardVisible: false, lastBack: '' };
export async function handleNativeBack() {
  if (keyboardVisible) {
    (document.activeElement as HTMLElement | null)?.blur();
    if (Capacitor.isNativePlatform()) await Keyboard.hide();
    shellState.lastBack = 'keyboard';
    return;
  }
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
  const dialog = dialogs.item(dialogs.length - 1);
  if (dialog) {
    // Existing ADDI sheets own Escape; medication deletion owns a cancel button.
    const cancel = dialog.querySelector<HTMLButtonElement>('button.cancel');
    if (cancel) cancel.click();
    else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    shellState.lastBack = 'overlay';
    return;
  }
  // Preserve existing form step/discard logic in FlowHeader.
  const back = document.querySelector<HTMLButtonElement>('.flow-header button[aria-label="이전 화면"]');
  if (back) { back.click(); shellState.lastBack = 'screen'; return; }
  if (hasNativeHistory()) { router.back(); shellState.lastBack = 'history'; return; }
  if (location.pathname !== '/') { router.replace('/'); shellState.lastBack = 'home'; return; }
  shellState.lastBack = 'exit';
  if (Capacitor.isNativePlatform()) await App.exitApp();
}
export async function startNativeLifecycle() {
  if (!Capacitor.isNativePlatform()) return;
  await SystemBars.setStyle({ style: SystemBarsStyle.Light });
  await SystemBars.show();
  await App.addListener('backButton', () => { void handleNativeBack(); });
  await App.addListener('appStateChange', ({ isActive }) => {
    shellState.active = isActive;
    if (isActive) {
      shellState.resumes++;
      window.dispatchEvent(new Event('focus'));
    }
  });
  await Keyboard.addListener('keyboardDidShow', () => { keyboardVisible = true; shellState.keyboardVisible = true; document.documentElement.dataset.keyboard = 'open'; });
  await Keyboard.addListener('keyboardDidHide', () => { keyboardVisible = false; shellState.keyboardVisible = false; delete document.documentElement.dataset.keyboard; });
}
export async function dismissNativeSplash() {
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (Capacitor.isNativePlatform()) await SplashScreen.hide();
}
