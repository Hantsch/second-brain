import { describe, expect, it } from 'vitest';
import {
  MAX_RESOURCE_BUDGET_PERCENT,
  MIN_RESOURCE_BUDGET_PERCENT,
  isValidResourceBudgetPercent,
  parseResourceBudgetPercent,
} from '@shared/llm/resource-budget';

describe('parseResourceBudgetPercent', () => {
  it('lehnt einen leeren String ab', () => {
    expect(parseResourceBudgetPercent('')).toEqual({ ok: false, error: 'empty' });
  });

  it('lehnt einen nur aus Leerraum bestehenden String ab', () => {
    expect(parseResourceBudgetPercent('   ')).toEqual({ ok: false, error: 'empty' });
  });

  it('lehnt einen nicht-numerischen String ab', () => {
    expect(parseResourceBudgetPercent('abc')).toEqual({ ok: false, error: 'not-a-number' });
  });

  it('lehnt eine gebrochene Zahl ab', () => {
    expect(parseResourceBudgetPercent('80.5')).toEqual({ ok: false, error: 'not-a-number' });
  });

  it('lehnt null ab', () => {
    expect(parseResourceBudgetPercent('0')).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('lehnt eine negative Zahl ab', () => {
    expect(parseResourceBudgetPercent('-5')).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('lehnt einen Wert unterhalb der Untergrenze ab', () => {
    expect(parseResourceBudgetPercent('9')).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('lehnt einen Wert oberhalb der Obergrenze ab', () => {
    expect(parseResourceBudgetPercent('101')).toEqual({ ok: false, error: 'out-of-range' });
  });

  it('akzeptiert 10', () => {
    expect(parseResourceBudgetPercent('10')).toEqual({ ok: true, valuePercent: 10 });
  });

  it('akzeptiert 80', () => {
    expect(parseResourceBudgetPercent('80')).toEqual({ ok: true, valuePercent: 80 });
  });

  it('akzeptiert 100', () => {
    expect(parseResourceBudgetPercent('100')).toEqual({ ok: true, valuePercent: 100 });
  });

  it('akzeptiert die Untergrenze', () => {
    expect(parseResourceBudgetPercent(String(MIN_RESOURCE_BUDGET_PERCENT))).toEqual({
      ok: true,
      valuePercent: MIN_RESOURCE_BUDGET_PERCENT,
    });
  });

  it('akzeptiert die Obergrenze', () => {
    expect(parseResourceBudgetPercent(String(MAX_RESOURCE_BUDGET_PERCENT))).toEqual({
      ok: true,
      valuePercent: MAX_RESOURCE_BUDGET_PERCENT,
    });
  });

  it('trimmt umgebenden Leerraum vor der Prüfung', () => {
    expect(parseResourceBudgetPercent('  80  ')).toEqual({ ok: true, valuePercent: 80 });
  });
});

describe('isValidResourceBudgetPercent', () => {
  it('akzeptiert einen gültigen Wert', () => {
    expect(isValidResourceBudgetPercent(80)).toBe(true);
  });

  it('lehnt null ab', () => {
    expect(isValidResourceBudgetPercent(0)).toBe(false);
  });

  it('lehnt eine negative Zahl ab', () => {
    expect(isValidResourceBudgetPercent(-5)).toBe(false);
  });

  it('lehnt eine gebrochene Zahl ab', () => {
    expect(isValidResourceBudgetPercent(80.5)).toBe(false);
  });

  it('lehnt einen zu großen Wert ab', () => {
    expect(isValidResourceBudgetPercent(MAX_RESOURCE_BUDGET_PERCENT + 1)).toBe(false);
  });
});
