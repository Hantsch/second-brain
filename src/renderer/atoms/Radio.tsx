/* Gaston Radio atom — thin wrapper over the gs-* classes from docs/design-system/gaston/project/components/forms/Radio.jsx. */
import type { InputHTMLAttributes } from 'react';

export interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
}

export function Radio({
  label,
  description,
  disabled = false,
  className = '',
  style,
  ...rest
}: RadioProps) {
  return (
    <label
      className={`gs-radio${disabled ? ' gs-radio--disabled' : ''} ${className}`}
      style={style}
    >
      <input type="radio" disabled={disabled} {...rest} />
      <span className="gs-radio-dot" aria-hidden="true"></span>
      {label || description ? (
        <span className="gs-ctrl-text">
          {label ? <span className="gs-ctrl-label">{label}</span> : null}
          {description ? <span className="gs-hint">{description}</span> : null}
        </span>
      ) : null}
    </label>
  );
}
