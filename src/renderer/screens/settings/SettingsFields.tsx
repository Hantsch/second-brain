/* Die kleinen Bauteile der Einstellungen: ein Feld mit Beispielzeile und ein
   Zahlenfeld.

   Das Zahlenfeld schreibt nicht bei jedem Tastendruck: es hält den Wert lokal und
   übergibt ihn, wenn der Nutzer fertig ist. Sonst läge nach dem
   Tippen von „14" kurz eine 1 in der Datei — und der Hauptprozess hätte zwei
   Schreibvorgänge und zwei Ereignisse für eine Eingabe. */

import { useId, useState } from 'react';
import type { ReactNode } from 'react';

export interface FieldProps {
  /** Ruhige Zeile unter dem Feld: ein Beispiel, bereits übersetzt. */
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
  /** Einheit hinter dem Feld, etwa „Tagen". */
  suffix?: string;
  onCommit: (value: number) => void;
}

export function NumberField({ label, hint, value, min, max, suffix, onCommit }: NumberFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [known, setKnown] = useState(value);

  /* Kommt der Wert von außen zurück (gespeichert, geklemmt, anderer Vault),
     folgt das Feld ihm — sonst zeigte es eine Eingabe, die nicht gilt. Das ist
     der Weg aus „You Might Not Need an Effect": beim Rendern nachziehen, nicht
     in einem Effekt hinterher. */
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

  /* Bewusst ohne das Input-Atom: Label, Feld, Einheit und Hinweis stehen hier in
     drei Zeilen, damit die Einheit neben dem Feld sitzt und nicht neben dem
     Hinweis. Die `gs-*`-Klassen sind dieselben. */
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
