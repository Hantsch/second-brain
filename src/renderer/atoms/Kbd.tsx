import type { HTMLAttributes } from 'react';

/* Gaston Kbd atom — thin wrapper over the `gs-kbd` class from
   docs/design-system/gaston/project/components/display/Kbd.jsx. */

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** Render a multi-cap key combo, e.g. ["⌘", "K"] — one <kbd> per key */
  keys?: string[];
}

export function Kbd({ keys, className = '', children, ...rest }: KbdProps) {
  if (keys && keys.length) {
    return (
      <span style={{ display: 'inline-flex', gap: 3 }} {...rest}>
        {keys.map((k, i) => (
          <kbd key={`${k}-${i}`} className={`gs-kbd ${className}`}>
            {k}
          </kbd>
        ))}
      </span>
    );
  }
  return (
    <kbd className={`gs-kbd ${className}`} {...rest}>
      {children}
    </kbd>
  );
}
