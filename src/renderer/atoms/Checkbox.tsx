/* Gaston Checkbox atom — thin wrapper over the gs-* classes from docs/design-system/gaston/project/components/forms/Checkbox.jsx. */
import type { InputHTMLAttributes } from 'react';
import { Icon } from './Icon';

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export function Checkbox({
  label,
  description,
  disabled = false,
  className = '',
  style,
  ...rest
}: CheckboxProps) {
  return (
    <label
      className={`gs-check${disabled ? ' gs-check--disabled' : ''} ${className}`}
      style={style}
    >
      <input type="checkbox" disabled={disabled} {...rest} />
      <span className="gs-check-box" aria-hidden="true">
        <Icon name="check" size={11} strokeWidth={3.5} />
      </span>
      {label || description ? (
        <span className="gs-ctrl-text">
          {label ? <span className="gs-ctrl-label">{label}</span> : null}
          {description ? <span className="gs-hint">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
