import { useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';

/* Gaston Input atom — thin wrapper over the `gs-field`/`gs-input` classes from
   docs/design-system/gaston/project/components/forms/Input.jsx. */

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Helper text below the field (replaced by error when set) */
  hint?: string;
  /** Error message; turns the border red and shows an alert icon */
  error?: string;
  /** Leading Lucide icon name, e.g. "search" (single-line only) */
  icon?: string;
  /** Render a textarea instead @default false */
  multiline?: boolean;
  className?: string;
}

export function Input({
  label,
  hint,
  error,
  icon,
  multiline = false,
  id,
  className = '',
  style,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const cls = [
    'gs-input',
    icon && !multiline ? 'gs-input--withicon' : '',
    error ? 'gs-input--invalid' : '',
  ].join(' ');
  return (
    <div className={`gs-field ${className}`} style={style}>
      {label ? (
        <label className="gs-label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <div className="gs-inputwrap">
        {icon && !multiline ? (
          <span className="gs-input-icon">
            <Icon name={icon} size={15} />
          </span>
        ) : null}
        {multiline ? (
          <textarea
            id={inputId}
            className={cls}
            aria-invalid={error ? true : undefined}
            {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          />
        ) : (
          <input id={inputId} className={cls} aria-invalid={error ? true : undefined} {...rest} />
        )}
      </div>
      {error ? (
        <span className="gs-errormsg">
          <Icon name="circle-alert" size={12} />
          {error}
        </span>
      ) : hint ? (
        <span className="gs-hint">{hint}</span>
      ) : null}
    </div>
  );
}
