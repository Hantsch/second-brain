// @vitest-environment jsdom
/* Der Slider ist ein natives input[type=range], damit Tastatur-Bedienung und
 * aria-valuenow/-min/-max ohne eigene Logik funktionieren. Getestet wird
 * deshalb vor allem die eine Sache, die nicht "geschenkt" ist: onCommit darf
 * pro Interaktion genau einmal feuern — nicht einmal pro Zwischenschritt eines
 * Drags, nicht einmal pro Tastendruck-Wiederholung.
 *
 * Ein echter Aufrufer hält `value` im eigenen State und reicht es aktualisiert
 * zurück (kontrollierte Komponente) — das bildet die Tests über einen
 * einfachen Wrapper nach, statt einen festen Prop-Wert zu rendern. */

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from '@renderer/atoms/Slider';

function ControlledSlider({
  onChange,
  onCommit,
  disabled = false,
}: {
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(60);
  return (
    <Slider
      min={10}
      max={100}
      step={1}
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      onCommit={onCommit}
      aria-label="Ressourcenbudget"
      aria-valuetext={`${value} Prozent`}
    />
  );
}

/* Nachbau von `BudgetRow`: das Feld wird deaktiviert, sobald die durch
   keyUp/pointerUp ausgelöste Mutation läuft — Chromium blurt ein fokussiertes
   Element in dem Moment, in dem es `disabled` wird. Dieser Wrapper reicht
   `disabled` von außen rein, damit der Test genau dieses Zusammenspiel
   nachstellen kann (Slider selbst kennt keine Mutation). */
function DisableOnCommitSlider({ onCommit }: { onCommit: (value: number) => void }) {
  const [disabled, setDisabled] = useState(false);
  return (
    <ControlledSlider
      onChange={vi.fn()}
      onCommit={(value) => {
        onCommit(value);
        setDisabled(true);
      }}
      disabled={disabled}
    />
  );
}

describe('Slider: Interaktion', () => {
  it('ist bedienbar — nicht deaktiviert, mit den korrekten aria-Werten', () => {
    render(<ControlledSlider onChange={vi.fn()} onCommit={vi.fn()} />);

    const slider = screen.getByRole('slider', { name: 'Ressourcenbudget' }) as HTMLInputElement;
    expect(slider.disabled).toBe(false);
    expect(slider.min).toBe('10');
    expect(slider.max).toBe('100');
    expect(slider.getAttribute('aria-valuetext')).toBe('60 Prozent');
    expect(slider.value).toBe('60');
  });

  it('feuert onCommit genau einmal pro Tastendruck', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<ControlledSlider onChange={onChange} onCommit={onCommit} />);

    const slider = screen.getByRole('slider');
    // Ein einzelner Tastendruck: der Browser ändert den Wert, das Feld feuert
    // change (live) und danach keyUp (Ende der Interaktion).
    fireEvent.change(slider, { target: { value: '61' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(61);
  });

  it('feuert onCommit genau einmal pro Drag, nicht einmal pro Zwischenschritt', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<ControlledSlider onChange={onChange} onCommit={onCommit} />);

    const slider = screen.getByRole('slider');
    // Ein Drag erzeugt viele change-Events (ein Mausschritt je Pixel) und
    // endet mit genau einem pointerup.
    fireEvent.change(slider, { target: { value: '65' } });
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.change(slider, { target: { value: '75' } });
    fireEvent.change(slider, { target: { value: '80' } });
    fireEvent.pointerUp(slider);

    expect(onChange).toHaveBeenCalledTimes(4);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(80);
  });

  it('feuert onCommit über blur als Auffangnetz', () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<ControlledSlider onChange={onChange} onCommit={onCommit} />);

    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '90' } });
    fireEvent.blur(slider);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(90);
  });

  it('feuert onCommit nur einmal, wenn ein Tastendruck-Commit das Feld deaktiviert und Chromium dadurch blurt', () => {
    const onCommit = vi.fn();
    render(<DisableOnCommitSlider onCommit={onCommit} />);

    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '61' } });
    fireEvent.keyUp(slider, { key: 'ArrowRight' });
    // jsdom simuliert kein Blur-bei-Disable von selbst — das bildet nach, was
    // Chromium tut, sobald `disabled` synchron nach dem Commit gesetzt wird.
    fireEvent.blur(slider);

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(61);
  });
});
