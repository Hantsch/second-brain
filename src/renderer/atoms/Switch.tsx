/* Gaston Switch atom — thin wrapper over the gs-* classes from docs/design-system/gaston/project/components/forms/Switch.jsx. */
import type { InputHTMLAttributes } from 'react';

export interface SwitchProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export function Switch({
  label,
  description,
  disabled = false,
  className = '',
  style,
  ...rest
}: SwitchProps) {
  return (
    <label
      className={`gs-switch${disabled ? ' gs-switch--disabled' : ''} ${className}`}
      style={style}
    >
      <input type="checkbox" role="switch" disabled={disabled} {...rest} />
      <span className="gs-switch-track" aria-hidden="true"></span>
      {label || description ? (
        <span className="gs-ctrl-text">
          {label ? <span className="gs-ctrl-label">{label}</span> : null}
          {description ? <span className="gs-hint">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
