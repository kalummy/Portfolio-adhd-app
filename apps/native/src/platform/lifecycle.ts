import { App } from '@capacitor/app';
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import { hasNativeHistory, router } from './router';
import { dateContextHref } from '@/lib/date-context';
import { installKeyboardViewport } from './keyboard-viewport';

let keyboardVisible = false;
const imeState = registerPlugin<{ getState(): Promise<{ visible: boolean }> }>('AddiImeState');
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
  if (location.pathname !== '/') { router.replace(dateContextHref('/')); shellState.lastBack = 'home'; return; }
  shellState.lastBack = 'exit';
  if (Capacitor.isNativePlatform()) await App.exitApp();
}
export async function startNativeLifecycle() {
  if (!Capacitor.isNativePlatform()) return;
  await SystemBars.setStyle({ style: SystemBarsStyle.Light });
  await SystemBars.show();
  const keyboardViewport = installKeyboardViewport();
  function updateKeyboard(visible: boolean) {
    keyboardVisible = visible;
    shellState.keyboardVisible = visible;
    if (visible) {
      document.documentElement.dataset.keyboard = 'open';
      keyboardViewport.show();
    } else {
      delete document.documentElement.dataset.keyboard;
      keyboardViewport.hide();
    }
  }
  let imeFrame = 0;
  let imeRequest = 0;
  function syncIme() {
    if (imeFrame) return;
    imeFrame = requestAnimationFrame(() => {
      imeFrame = 0;
      const request = ++imeRequest;
      // Read actual root IME visibility after SystemBars resizes the WebView.
      // This also handles cancelled/missing Keyboard animation events.
      void imeState.getState().then(state => {
        if (request === imeRequest) updateKeyboard(state.visible);
      }).catch(() => undefined);
    });
  }
  document.addEventListener('focusin', syncIme);
  window.addEventListener('resize', syncIme);
  window.visualViewport?.addEventListener('resize', syncIme);
  await App.addListener('backButton', () => { void handleNativeBack(); });
  await App.addListener('appStateChange', ({ isActive }) => {
    shellState.active = isActive;
    if (isActive) {
      shellState.resumes++;
      syncIme();
      window.dispatchEvent(new Event('focus'));
    }
  });
  await Keyboard.addListener('keyboardDidShow', () => {
    updateKeyboard(true);
    syncIme();
  });
  await Keyboard.addListener('keyboardDidHide', () => {
    updateKeyboard(false);
    syncIme();
  });
}
export async function dismissNativeSplash() {
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  if (Capacitor.isNativePlatform()) await SplashScreen.hide();
}
