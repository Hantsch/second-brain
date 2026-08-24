/* Gaston Slider atom — thin wrapper over native input[type=range] so keyboard
 * operation (arrow keys, Home/End) and aria-valuenow/min/max come for free.
 * `onChange` fires live (every keypress / every drag step) so callers can
 * relabel immediately; `onCommit` fires exactly once when the interaction
 * ends: pointer-up after a drag, key-up after a keyboard press, or blur as a
 * catch-all for focus leaving without either of those (e.g. a caller
 * disabling the control mid-interaction, which also forces a native blur).
 * The last-committed value is tracked so that catch-all blur never re-fires
 * onCommit for a value that pointer-up/key-up already committed. */
import { useRef, type InputHTMLAttributes } from 'react';

export interface SliderProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}

export function Slider({
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
  disabled = false,
  className = '',
  style,
  ...rest
}: SliderProps) {
  const lastCommitted = useRef(value);

  const commit = (event: { currentTarget: HTMLInputElement }) => {
    const next = Number(event.currentTarget.value);
    if (next === lastCommitted.current) return;
    lastCommitted.current = next;
    onCommit(next);
  };

  return (
    <input
      type="range"
      className={`gs-slider ${className}`}
      style={style}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      onPointerUp={commit}
      onKeyUp={commit}
      onBlur={commit}
      {...rest}
    />
  );
}
