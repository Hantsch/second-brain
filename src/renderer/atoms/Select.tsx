import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { Icon } from './Icon';

/* Gaston Select atom — thin wrapper over the `gs-field`/`gs-input`/`gs-select` classes
   from docs/design-system/gaston/project/components/forms/Select.jsx. */

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Options as strings or {value,label} pairs */
  options?: Array<string | { value: string; label: string }>;
  /** Disabled first option shown until a value is chosen */
  placeholder?: string;
  className?: string;
}

export function Select({
  label,
  hint,
  error,
  options = [],
  placeholder,
  id,
  className = '',
  style,
  children,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const selectId = id || autoId;
  const cls = ['gs-input', 'gs-select', error ? 'gs-input--invalid' : ''].join(' ');
  const showPlaceholderAsValue =
    placeholder && rest.value === undefined && rest.defaultValue === undefined;
  return (
    <div className={`gs-field ${className}`} style={style}>
      {label ? (
        <label className="gs-label" htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <div className="gs-inputwrap">
        <select
          id={selectId}
          className={cls}
          aria-invalid={error ? true : undefined}
          defaultValue={showPlaceholderAsValue ? '' : undefined}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((opt) => {
            const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
            return (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            );
          })}
          {children}
        </select>
        <span className="gs-select-chevron">
          <Icon name="chevron-down" size={15} />
        </span>
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
