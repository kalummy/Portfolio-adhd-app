import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());
let depth = 0;
export function internalPath(href: string): string | null {
  const url = new URL(href, window.location.origin);
  return url.origin === window.location.origin && !url.pathname.startsWith('/api/')
    ? `${url.pathname}${url.search}` : null;
}
function navigate(href: string, replace = false) {
  const path = internalPath(href);
  if (!path) return;
  if (!replace) depth++;
  history[replace ? 'replaceState' : 'pushState']({ nativeDepth: depth }, '', path);
  notify();
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => {
  depth = history.state?.nativeDepth ?? 0;
  notify();
});
export const router = {
  bfcacheId: null,
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href, true),
  back: () => depth > 0 ? history.back() : navigate('/', true),
  refresh: notify,
  prefetch: () => Promise.resolve(),
};
export const hasNativeHistory = () => depth > 0;
export function useLocation() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => `${location.pathname}${location.search}`);
}
export function useRouter() { return router; }
export function usePathname() { return useLocation().split('?')[0]; }
export function useSearchParams() { return new URLSearchParams(useLocation().split('?')[1] ?? ''); }
