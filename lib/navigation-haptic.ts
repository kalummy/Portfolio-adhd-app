/** Existing Web/TWA behavior; Native replaces this module at its build boundary. */
export function navigationHaptic(_selected: boolean) {
  window.setTimeout(() => { if ('vibrate' in navigator) navigator.vibrate(8); }, 0);
}
