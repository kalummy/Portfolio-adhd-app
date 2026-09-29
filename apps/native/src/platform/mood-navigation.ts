import { router } from './router';

/** Keep the verified session, launch state and resource cache in the current document. */
export function navigateMoodHome(href: string, replace = false) {
  if (replace) router.replace(href);
  else router.push(href);
}
