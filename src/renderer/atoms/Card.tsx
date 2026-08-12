import type { HTMLAttributes } from 'react';

/* Gaston Card atom — thin wrapper over the `gs-card` classes from
   docs/design-system/gaston/project/components/display/Card.jsx. */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  interactive?: boolean;
}

export function Card({
  padded = true,
  interactive = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  const cls = [
    'gs-card',
    padded ? 'gs-card--padded' : '',
    interactive ? 'gs-card--interactive' : '',
    className,
  ].join(' ');
  return (
    <div className={cls} {...rest}>
      {children}
    </div>
  );
}
