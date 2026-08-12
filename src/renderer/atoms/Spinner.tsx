import type { CSSProperties } from 'react';
import { Icon } from './Icon';

/* Gaston Spinner atom — thin wrapper over the `gs-spin` class from
   docs/design-system/gaston/project/components/feedback/Spinner.jsx. */

export interface SpinnerProps {
  size?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function Spinner({ size = 16, label = 'Loading', className = '', style }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={className}
      style={{ display: 'inline-flex', color: 'var(--text-faint)', ...style }}
    >
      <Icon name="loader-circle" size={size} className="gs-spin" />
    </span>
  );
}
