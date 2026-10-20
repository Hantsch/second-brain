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

  /* Rail und Kopfpaare sind nicht mehr dieselbe Menge: „Quellen" ist ein Tab
     unter „Wissen", „Erfassen" und „Fragen" sind Overlays der Hülle. Ihre
     `screen.*`-Keys braucht jeweils die neue Stelle weiter, ihr `rail.*`-Key
     aber niemand mehr — taucht er wieder auf, ist die Rail zurückgewachsen. */
  it('deckt jeden Eintrag der Rail ab', () => {
    for (const screen of SCREENS) {
      expect(deKeys, `Rail-Eintrag ${screen.id}`).toContain(screen.labelKey);
    }
    expect(deKeys).not.toContain('rail.modules');
    expect(deKeys).not.toContain('rail.sources');
    expect(deKeys).not.toContain('rail.capture');
    expect(deKeys).not.toContain('rail.ask');
  });

  it('deckt das Kopfpaar und den Leerzustand jedes Screens ab', () => {
    for (const screen of [
      'dashboard',
      'capture',
      'ask',
      'projects',
      'journal',
      'notes',
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

  /* 072, D1: Aufgaben ist der einzige Screen ohne `empty.action` — Arbeit
     beginnt hier nie an einer leeren Warteschlange, immer an einem Projekt,
     einem Tag oder einem Bereich (Entscheidung der Story). Ein eigener Block
     statt der Erweiterung der Liste oben, damit die generelle Regel dort
     ("jeder Screen hat einen Aktions-Key") nicht für diesen einen Screen
     aufgeweicht werden muss. */
  it('deckt Kopfpaar und Leerzustand von Aufgaben ab, aber ohne Aktion', () => {
    for (const suffix of ['overline', 'title', 'empty.title', 'empty.body']) {
      expect(deKeys).toContain(`screen.tasks.${suffix}`);
    }
    expect(deKeys).not.toContain('screen.tasks.empty.action');
  });

  /* Die Inbox ist kein Screen mehr, sondern der Filter „nicht abgelegt" auf
     Notizen (Story 006): den einen `ScreenHeader` stellt `NotesScreen`, also
     gibt es kein eigenes Kopfpaar mehr — steht es wieder da, ist die Inbox als
     Ort zurückgewachsen. Der Leerzustand bleibt, er gehört der Arbeitsfläche
     (`UnfiledWorkspace`), und die Sätze des Filters selbst kommen dazu. */
  it('hat für die Inbox keinen Kopf mehr, aber ihren Leerzustand und die Filter-Sätze', () => {
    expect(deKeys).not.toContain('screen.inbox.overline');
    expect(deKeys).not.toContain('screen.inbox.title');
    for (const suffix of ['empty.title', 'empty.body', 'empty.action']) {
      expect(deKeys).toContain(`screen.inbox.${suffix}`);
    }
    expect(deKeys).toContain('notes.filter.unfiled');
    expect(deKeys).toContain('notes.unfiled.optional');
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

  /* D8 (050): `describeFailure` liest den `code` jedes Fehlers strukturell —
     ein gescheiterter Auftrag kann also den Code von `IngestError` ODER
     `WikiError` tragen (und, ab 051/064, den kuenftiger Fehlertypen mit
     demselben Vertrag). Beide Sprachen brauchen fuer jeden dieser Codes einen
     Satz, sonst faellt die Oberflaeche auf den rohen Key zurueck. */
  it('deckt jeden Fehlercode ab, den ein gescheiterter Auftrag tragen kann', () => {
    for (const code of [
      // IngestError
      'invalid',
      'not-found',
      'io',
      'cancelled',
      'unknown',
      // WikiError
      'conflict',
    ]) {
      expect(deKeys, `de: error.code.${code}`).toContain(`error.code.${code}`);
      expect(enKeys, `en: error.code.${code}`).toContain(`error.code.${code}`);
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

  /* Anführungszeichen-Konvention (Story 026): Deutsch öffnet mit U+201E „ und
     schließt mit U+201C “ — nie mit dem ASCII-Zeichen " oder U+201D. Englisch
     kennt das deutsche Öffnungszeichen U+201E gar nicht, auch nicht in den
     rohen Quelldateien (import.meta.glob oben liefert sie als Text). */
  it('hält die Anführungszeichen-Konvention ein: „…“ auf Deutsch, kein U+201E auf Englisch', () => {
    for (const [key, value] of Object.entries(de)) {
      expect(value, `de: ${key} enthält ein falsches Schlusszeichen (" oder U+201D)`).not.toMatch(
        /["”]/,
      );
      const openers = value.match(/„/g)?.length ?? 0;
      const closers = value.match(/“/g)?.length ?? 0;
      expect(closers, `de: ${key} — „ ohne passendes “`).toBe(openers);
    }

    for (const [key, value] of Object.entries(en)) {
      expect(value, `en: ${key} enthält ein deutsches Anführungszeichen (U+201E)`).not.toMatch(/„/);
    }

    for (const [path, source] of Object.entries(SOURCES)) {
      const file = path.split('/').pop() ?? path;
      if (!file.startsWith('en')) continue;
      expect(source, `${file} enthält ein deutsches Anführungszeichen (U+201E)`).not.toMatch(/„/);
    }
  });

  /* Der Produktname ist auf „Gaston" vereinheitlicht (Story 030). Taucht der
     alte Name in irgendeiner Katalogdatei wieder auf — als Fließtext, nicht
     nur als Key —, ist das ein Rückfall, den nur ein Test bemerkt. */
  it('nennt nirgends mehr den alten Produktnamen', () => {
    for (const [path, source] of Object.entries(SOURCES)) {
      const file = path.split('/').pop() ?? path;
      if (!file.startsWith('de') && !file.startsWith('en')) continue;
      expect(source, `${file} enthält noch den alten Produktnamen`).not.toMatch(
        /second[\s-]*brain|zweites hirn/i,
      );
    }
  });
});
