// @vitest-environment jsdom
/* Zwei Sprachen, ein Key-Satz. Fehlt ein Key auf einer Seite, fällt die
   Oberfläche in der anderen Sprache auf den Key zurück — das ist kein
   akzeptabler Zustand. */

import { describe, expect, it } from 'vitest';
import { de } from '@renderer/i18n/de';
import { en } from '@renderer/i18n/en';
import { setLanguage, t } from '@renderer/i18n';
import { SCREENS } from '@renderer/lib/screens';

const deKeys = Object.keys(de).sort();
const enKeys = Object.keys(en).sort();

/* Die Texte im Rohzustand — der Renderer-Test fasst kein Dateisystem an, also
   holt Vite sie als Text herein. */
const SOURCES: Record<string, string> = import.meta.glob('../../src/renderer/i18n/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/* Ein Key in der Quelle: `'bereich.name': '…'`. */
const KEY_LINE = /'([a-zA-Z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9-]+)+)':/g;

/** Welcher Key steht in welchen Teildateien? Pro Sprache getrennt. */
function keysBySource(language: 'de' | 'en'): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [path, source] of Object.entries(SOURCES)) {
    const file = path.split('/').pop() ?? path;
    if (!file.startsWith(language)) continue;
    for (const match of source.matchAll(KEY_LINE)) {
      const key = match[1] ?? '';
      found.set(key, [...(found.get(key) ?? []), file]);
    }
  }
  return found;
}

describe('i18n', () => {
  it('hat in beiden Sprachen denselben Key-Satz', () => {
    expect(enKeys).toEqual(deKeys);
  });

  /* Die Texte liegen in mehreren Dateien, die per Spread zusammenkommen. Steht ein
     Key in zwei davon, gewinnt still die spätere — ein Text, den niemand mehr
     findet, und ein Konflikt, den nur eine Maschine sieht. */
  it('vergibt jeden Key genau einmal über alle Teildateien', () => {
    for (const language of ['de', 'en'] as const) {
      const doubled = [...keysBySource(language).entries()]
        .filter(([, files]) => files.length > 1)
        .map(([key, files]) => `${key} (${files.join(', ')})`);
      expect(doubled, `${language}: doppelt vergebene Keys`).toEqual([]);
    }
  });

  it('findet in den Quelldateien genau die Keys, die auch im Objekt stehen', () => {
    /* Sonst prüft der Test oben eine andere Menge als die App benutzt. */
    expect([...keysBySource('de').keys()].sort()).toEqual(deKeys);
    expect([...keysBySource('en').keys()].sort()).toEqual(enKeys);
  });

  it('hat keine leeren Werte', () => {
    for (const [key, value] of Object.entries({ ...de })) {
      expect(value.trim(), `de: ${key}`).not.toBe('');
    }
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), `en: ${key}`).not.toBe('');
    }
  });

  /* Seit „Quellen" ein Tab unter „Wissen" ist, fallen die beiden Mengen
     auseinander: die Rail führt nicht mehr zu den Quellen, deren Kopfpaar
     `screen.sources.*` braucht der Tab aber weiter. */
  it('deckt jeden Eintrag der Rail ab', () => {
    for (const screen of SCREENS) {
      expect(deKeys, `Rail-Eintrag ${screen.id}`).toContain(screen.labelKey);
    }
    expect(deKeys).not.toContain('rail.modules');
    expect(deKeys).not.toContain('rail.sources');
  });

  it('deckt das Kopfpaar und den Leerzustand jedes Screens ab', () => {
    for (const screen of [
      'dashboard',
      'capture',
      'inbox',
      'ask',
      'projects',
      'journal',
      'knowledge',
      'sources',
      'garden',
      'settings',
    ]) {
      for (const suffix of ['overline', 'title', 'empty.title', 'empty.body', 'empty.action']) {
        expect(deKeys).toContain(`screen.${screen}.${suffix}`);
      }
    }
  });

  it('deckt jeden Fehlercode und jede LLM-Aufgabe ab', () => {
    for (const code of [
      'no-vault',
      'not-found',
      'conflict',
      'llm-unavailable',
      'invalid',
      'io',
      'cancelled',
      'unknown',
    ]) {
      expect(deKeys).toContain(`error.code.${code}`);
    }
    for (const task of [
      'classify-dump',
      'title-tags',
      'extract-tasks',
      'summarize-source',
      'wiki-ingest',
      'query-answer',
      'query-rerank',
      'journal-chat',
      'project-status',
      'gardener-audit',
    ]) {
      expect(deKeys).toContain(`task.${task}.label`);
      expect(deKeys).toContain(`task.${task}.hint`);
    }
  });

  it('setzt Platzhalter ein und wechselt die Sprache', () => {
    setLanguage('de');
    expect(t('vault.docs', { count: 7 })).toContain('7');
    setLanguage('en');
    expect(t('rail.dashboard')).toBe('Dashboard');
    expect(t('titlebar.close')).toBe(en['titlebar.close']);
    setLanguage('de');
    expect(t('titlebar.close')).toBe(de['titlebar.close']);
  });

  it('gibt unbekannte Keys unverändert zurück', () => {
    expect(t('gibt.es.nicht')).toBe('gibt.es.nicht');
  });
});
