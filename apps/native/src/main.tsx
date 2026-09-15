import { createRoot } from 'react-dom/client';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import '../../../app/globals.css';
import './shell.css';
import { permittedNativeRequest } from './auth/client';
import { startNativeAuth } from './auth/runtime';
import { startNativePush } from './push/runtime';
import { NativeApp } from './app';
import { startNativeLifecycle, handleNativeBack, shellState } from './platform/lifecycle';
import { PhaseUnavailableError } from './adapters/boundaries';
import { installNativeApiFetch } from './api/client';
import { startNativeAccountBoundary } from './api/account-boundary';

// Prototype-only QA bridge; exposes shell state, never record contents.
Object.assign(window, { __ADDI_SHELL_QA__: { back: handleNativeBack, state: shellState } });

// Local assets only. Shared screen fetches cannot accidentally contact Production.
const assetFetch = window.fetch.bind(window);
window.fetch = installNativeApiFetch((input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if ((url.origin !== location.origin && !permittedNativeRequest(url)) || (url.origin === location.origin && url.pathname.startsWith('/api/'))) return Promise.reject(new PhaseUnavailableError(2));
  return assetFetch(input, init);
});
startNativeAccountBoundary();
void startNativeLifecycle().then(() => {
  void startNativePush().then(() => startNativeAuth());
  createRoot(document.getElementById('root')!).render(<NativeApp />);
}).catch(() => {
  document.getElementById('root')!.textContent = '앱을 시작하지 못했어요. 앱을 다시 실행해주세요.';
});
