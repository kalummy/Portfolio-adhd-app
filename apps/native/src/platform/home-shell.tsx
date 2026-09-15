import { Children, isValidElement, type HTMLAttributes, type ReactNode } from 'react';
import { MobileShell as SharedMobileShell } from '../../../../components/mobile-shell';

type Props = HTMLAttributes<HTMLElement> & { children: ReactNode };

/** Native-only substitution for Home's shell; all shared screen content stays intact. */
export function MobileShell({ children, className = '', ...props }: Props) {
  const nodes = Children.toArray(children);
  const header = nodes.findIndex(node => isValidElement(node) && node.type === 'header');
  const footer = nodes.findIndex(node => isValidElement(node) && node.type === 'footer');
  if (header !== 0 || footer <= header) throw new Error('native_home_structure_changed');
  return <SharedMobileShell {...props} className={`${className} native-home-frame`}>
    {nodes[header]}
    <div className="native-home-scroll">{nodes.slice(header + 1, footer + 1)}</div>
    {nodes.slice(footer + 1)}
  </SharedMobileShell>;
}
