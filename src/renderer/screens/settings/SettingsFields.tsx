/* The small building blocks of settings: a field with an example line and a
   number field.

   The number field does not write on every keystroke: it holds the value
   locally and hands it over once the user is done. Otherwise, typing "14"
   would briefly leave a 1 in the file — and the main process would get two
   writes and two events for one input. */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface FieldProps {
  /** Quiet line below the field: an example, already translated. */
  example?: string;
  children: ReactNode;
}

export function Field({ example, children }: FieldProps) {
  return (
    <div className="sb-setting">
      {children}
      {example ? <p className="sb-setting-example">{example}</p> : null}
    </div>
  );
}

export interface NumberFieldProps {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  /** Unit after the field, e.g. "days". */
  suffix?: string;
  onCommit: (value: number) => void;
}

export function NumberField({ label, hint, value, min, max, suffix, onCommit }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [known, setKnown] = useState(value);

  /* If the value comes back from outside (saved, clamped, different vault),
     the field follows it — otherwise it would show an input that's no longer
     valid. This is the pattern from "You Might Not Need an Effect": catch up
     during render, not chase after it in an effect. */
  if (known !== value) {
    setKnown(value);
    setDraft(String(value));
  }

  const commit = (): void => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    setDraft(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };

  /* Deliberately without the input atom: label, field, unit, and hint are laid
     out here in three rows so the unit sits next to the field and not next to
     the hint. The `gs-*` classes are the same. */
  return (
    <div className="sb-setting">
      <label className="gs-label" htmlFor={id}>
        {label}
      </label>
      <div className="sb-numberrow">
        <div className="gs-inputwrap">
          <input
            id={id}
            className="gs-input"
            type="number"
            min={min}
            max={max}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
            }}
          />
        </div>
        {suffix ? <span className="sb-setting-suffix">{suffix}</span> : null}
      </div>
      {hint ? <span className="gs-hint">{hint}</span> : null}
    </div>
  );
}
