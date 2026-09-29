/** Web/TWA retain their existing document navigation and draft cleanup lifecycle. */
export function navigateMoodHome(href: string, replace = false) {
  if (replace) window.location.replace(href);
  else window.location.assign(href);
}
