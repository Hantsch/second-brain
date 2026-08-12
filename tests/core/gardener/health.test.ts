/* Der Gesundheitswert. Drei Zusicherungen:
   - relativ zur Größe: dieselben Befunde wiegen in einem kleinen Bestand schwerer;
   - erklärbar: die Beiträge summieren sich auf den Verlust;
   - ein leerer Bestand hat keine Gesundheit, nicht 100 und nicht 0. */

import { describe, expect, it } from 'vitest';
import { FULL_ROT_PENALTY_PER_UNIT, healthScore, vaultSize } from '@core/gardener';
import type { FindingSeverity, GardenerFinding, GardenerFindingKind } from '@shared/types';
import { SETTINGS, demoFixture, gardenerFixture } from './fixtures';

function finding(
  kind: GardenerFindingKind,
  severity: FindingSeverity,
  at: number,
): GardenerFinding {
  return {
    id: `${kind}-${at}`,
    kind,
    severity,
    title: `Befund ${at}`,
    detail: '',
    paths: [],
    module: null,
    foundAt: '2026-08-10T00:00:00.000Z',
    fix: null,
  };
}

function many(kind: GardenerFindingKind, severity: FindingSeverity, count: number) {
  return Array.from({ length: count }, (_unused, at) => finding(kind, severity, at));
}

describe('healthScore', () => {
  it('wiegt dieselben Befunde im kleinen Bestand schwerer', async () => {
    const links = many('broken-link', 'warn', 10);

    const big = healthScore(links, 500);
    const small = healthScore(links, 20);

    expect(big.score).toBe(98);
    expect(small.score).toBe(50);
  });

  it('gibt einem leeren Bestand keine Gesundheit', () => {
    const result = healthScore([], 0);

    expect(result.score).toBeNull();
    expect(result.contributions).toEqual([]);
  });

  it('gibt einem Bestand ohne Befunde die volle Gesundheit', () => {
    expect(healthScore([], 42).score).toBe(100);
  });

  it('erklärt den Verlust je Kategorie, und die Summe passt zur Zahl', () => {
    const result = healthScore(
      [...many('contradiction', 'high', 1), ...many('orphan', 'info', 4)],
      40,
    );

    const sum = result.contributions.reduce((total, entry) => total + entry.points, 0);
    expect(sum).toBe(100 - (result.score ?? 0));
    expect(result.contributions[0]?.kind).toBe('contradiction');
    expect(result.contributions.map((entry) => entry.count)).toEqual([1, 4]);
  });

  it('gewichtet nach Schwere: ein schwerer Befund wiegt mehr als vier leichte', () => {
    const heavy = healthScore(many('contradiction', 'high', 1), 30).score ?? 0;
    const light = healthScore(many('orphan', 'info', 4), 30).score ?? 0;

    expect(heavy).toBeLessThan(light);
  });

  it('fällt auf null, wenn auf jede Einheit ein mittelschwerer Befund kommt', () => {
    const result = healthScore(many('broken-link', 'warn', 30), 30);

    expect(FULL_ROT_PENALTY_PER_UNIT).toBe(3);
    expect(result.score).toBe(0);
  });

  it('bleibt bei null und verteilt die Beiträge weiter aufs Ganze', () => {
    const result = healthScore(many('contradiction', 'high', 50), 10);

    expect(result.score).toBe(0);
    expect(result.contributions.reduce((total, entry) => total + entry.points, 0)).toBe(100);
  });
});

describe('vaultSize', () => {
  it('zählt alles, worauf ein Check schaut', async () => {
    const fixture = await demoFixture();

    /* 13 Wiki-Seiten, 3 Projekte, 2 Rohquellen, 3 Dumps. */
    expect(vaultSize(fixture.index)).toBe(21);
  });

  it('ist für einen Vault ohne Inhalt null', async () => {
    const fixture = await gardenerFixture({ 'README.md': '# Leer\n' });

    expect(vaultSize(fixture.index)).toBe(0);
    expect(healthScore([], vaultSize(fixture.index)).score).toBeNull();
  });

  it('bezieht den Bericht des Demo-Bestands auf diese Größe', async () => {
    const fixture = await demoFixture();
    const { runGardener } = await import('@core/gardener');

    const report = await runGardener(fixture.deps(), { settings: SETTINGS });
    const expected = healthScore(report.findings, vaultSize(fixture.index));

    expect(report.health).toBe(expected.score);
    expect(report.healthContributions).toEqual(expected.contributions);
  });
});
