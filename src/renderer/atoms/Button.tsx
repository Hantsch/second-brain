import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';

/* Gaston Button atom — thin wrapper over the `gs-btn` classes from
   docs/design-system/gaston/project/components/actions/Button.jsx. */

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Leading icon (kebab-case name, see Icon atom) */
  icon?: string;
  /** Trailing icon (kebab-case name, see Icon atom) */
  trailingIcon?: string;
  loading?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`gs-btn gs-btn--${variant} gs-btn--${size} ${className}`}
      {...rest}
    >
      {loading ? (
        <Icon name="loader-circle" size={iconSize} className="gs-spin" />
      ) : icon ? (
        <Icon name={icon} size={iconSize} />
      ) : null}
      {children}
      {trailingIcon ? <Icon name={trailingIcon} size={iconSize} /> : null}
    </button>
  );
}
