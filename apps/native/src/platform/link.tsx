import type { AnchorHTMLAttributes } from 'react';
import { internalPath, router } from './router';
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string; replace?: boolean; prefetch?: boolean; scroll?: boolean;
  onNavigate?: (event: { preventDefault(): void }) => void;
};
export default function Link({ href, replace, prefetch: _prefetch, scroll: _scroll, onClick, onNavigate, children, ...props }: Props) {
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();
    if (!internalPath(href)) return;
    let cancelled = false;
    onNavigate?.({ preventDefault: () => { cancelled = true; } });
    if (!cancelled) router[replace ? 'replace' : 'push'](href);
  }}>{children}</a>;
}
