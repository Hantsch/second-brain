import type { ButtonHTMLAttributes } from 'react';
import { Icon } from './Icon';

/* Gaston IconButton atom — thin wrapper over the `gs-iconbtn` classes from
   docs/design-system/gaston/project/components/actions/IconButton.jsx. */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Kebab-case icon name, see Icon atom */
  icon: string;
  /** Accessible label; also used as the title tooltip */
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  type = 'button',
  className = '',
  ...rest
}: IconButtonProps) {
  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 20 : 17;
  return (
    <button
      type={type}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`gs-btn gs-iconbtn gs-btn--${variant} gs-btn--${size} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={iconSize} />
    </button>
  );
}
