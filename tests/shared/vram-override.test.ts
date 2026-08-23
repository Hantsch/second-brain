import { describe, expect, it } from 'vitest';
import {
  VRAM_OVERRIDE_MAX_GB,
  VRAM_OVERRIDE_MAX_MB,
  VRAM_OVERRIDE_MIN_GB,
  VRAM_OVERRIDE_MIN_MB,
  isValidVramOverrideMb,
  parseVramOverrideGb,
  parseVramOverrideMb,
} from '@shared/llm/vram-override';

describe('parseVramOverrideMb', () => {
  it('lehnt einen leeren String ab', () => {
    expect(parseVramOverrideMb('')).toEqual({ ok: false, error: 'empty' });
  });

  it('lehnt einen nur aus Leerraum bestehenden String ab', () => {
    expect(parseVramOverrideMb('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('lehnt einen nicht-numerischen String ab', () => {
    expect(parseVramOverrideMb('abc')).toEqual({ ok: false, error: 'not-a-number' });
  });

  it('lehnt eine gebrochene Zahl ab', () => {
    expect(parseVramOverrideMb('16384.5')).toEqual({ ok: false, error: 'not-a-number' });
  });

  it('lehnt null ab', () => {
    expect(parseVramOverrideMb('0')).toEqual({ ok: false, error: 'not-positive' });
  });

  it('lehnt eine negative Zahl ab', () => {
    expect(parseVramOverrideMb('-5')).toEqual({ ok: false, error: 'not-positive' });
  });

  it('lehnt einen Wert unterhalb der plausiblen Untergrenze ab', () => {
    expect(parseVramOverrideMb('255')).toEqual({ ok: false, error: 'not-positive' });
  });

  it('lehnt einen absurd großen Wert ab', () => {
    expect(parseVramOverrideMb('999999999')).toEqual({ ok: false, error: 'too-large' });
  });

  it('lehnt einen Wert direkt oberhalb der Obergrenze ab', () => {
    expect(parseVramOverrideMb(String(VRAM_OVERRIDE_MAX_MB + 1))).toEqual({
      ok: false,
      error: 'too-large',
    });
  });

  it('akzeptiert 16384', () => {
    expect(parseVramOverrideMb('16384')).toEqual({ ok: true, valueMb: 16384 });
  });

  it('akzeptiert die Untergrenze', () => {
    expect(parseVramOverrideMb(String(VRAM_OVERRIDE_MIN_MB))).toEqual({
      ok: true,
      valueMb: VRAM_OVERRIDE_MIN_MB,
    });
  });

  it('akzeptiert die Obergrenze', () => {
    expect(parseVramOverrideMb(String(VRAM_OVERRIDE_MAX_MB))).toEqual({
      ok: true,
      valueMb: VRAM_OVERRIDE_MAX_MB,
    });
  });

  it('trimmt umgebenden Leerraum vor der Prüfung', () => {
    expect(parseVramOverrideMb('  16384  ')).toEqual({ ok: true, valueMb: 16384 });
  });
});

describe('parseVramOverrideGb', () => {
  it('lehnt einen leeren String ab', () => {
    expect(parseVramOverrideGb('')).toEqual({ ok: false, error: 'empty' });
  });

  it('lehnt einen nur aus Leerraum bestehenden String ab', () => {
    expect(parseVramOverrideGb('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('lehnt einen nicht-numerischen String ab', () => {
    expect(parseVramOverrideGb('abc')).toEqual({ ok: false, error: 'not-a-number' });
  });

  it('akzeptiert 16 als 16384 MB', () => {
    expect(parseVramOverrideGb('16')).toEqual({ ok: true, valueMb: 16384 });
  });

  it('akzeptiert 12,5 (Komma) als 12800 MB', () => {
    expect(parseVramOverrideGb('12,5')).toEqual({ ok: true, valueMb: 12800 });
  });

  it('akzeptiert 12.5 (Punkt) als 12800 MB', () => {
    expect(parseVramOverrideGb('12.5')).toEqual({ ok: true, valueMb: 12800 });
  });

  it('lehnt null ab', () => {
    expect(parseVramOverrideGb('0')).toEqual({ ok: false, error: 'not-positive' });
  });

  it('lehnt eine negative Zahl ab', () => {
    expect(parseVramOverrideGb('-5')).toEqual({ ok: false, error: 'not-positive' });
  });

  it('lehnt einen Wert knapp unterhalb der Untergrenze ab', () => {
    expect(parseVramOverrideGb('0.24')).toEqual({ ok: false, error: 'not-positive' });
  });

  it('lehnt einen Wert knapp oberhalb der Obergrenze ab', () => {
    expect(parseVramOverrideGb('257')).toEqual({ ok: false, error: 'too-large' });
  });

  it('akzeptiert die Untergrenze', () => {
    expect(parseVramOverrideGb(String(VRAM_OVERRIDE_MIN_GB))).toEqual({
      ok: true,
      valueMb: VRAM_OVERRIDE_MIN_MB,
    });
  });

  it('akzeptiert die Obergrenze', () => {
    expect(parseVramOverrideGb(String(VRAM_OVERRIDE_MAX_GB))).toEqual({
      ok: true,
      valueMb: VRAM_OVERRIDE_MAX_MB,
    });
  });

  it('trimmt umgebenden Leerraum vor der Prüfung', () => {
    expect(parseVramOverrideGb('  16  ')).toEqual({ ok: true, valueMb: 16384 });
  });
});

describe('isValidVramOverrideMb', () => {
  it('akzeptiert einen gültigen Wert', () => {
    expect(isValidVramOverrideMb(16384)).toBe(true);
  });

  it('lehnt null ab', () => {
    expect(isValidVramOverrideMb(0)).toBe(false);
  });

  it('lehnt eine negative Zahl ab', () => {
    expect(isValidVramOverrideMb(-5)).toBe(false);
  });

  it('lehnt eine gebrochene Zahl ab', () => {
    expect(isValidVramOverrideMb(16384.5)).toBe(false);
  });

  it('lehnt einen zu großen Wert ab', () => {
    expect(isValidVramOverrideMb(VRAM_OVERRIDE_MAX_MB + 1)).toBe(false);
  });
});
