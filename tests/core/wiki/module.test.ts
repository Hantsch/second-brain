/* Ein Modul anlegen: fuenf Startdateien, in der Dokumentsprache, idempotent.
 *
 * Das Wichtigste ist `AGENTS.md`. Es macht den Vault selbsterklaerend: ein fremdes
 * LLM soll das Modul pflegen koennen, ohne diese App zu haben. Deshalb prueft ein
 * Test auch, dass die eingebaute Vorlage nicht von docs/MODULE-SCHEMA.md abdriftet.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IndexService } from '@core/index/service';
import {
  MODULE_SCHEMA_TEMPLATE,
  agentsPath,
  createModule,
  listModules,
  renderAgentsMd,
} from '@core/wiki';
import { parse } from '@core/vault/frontmatter';
import { MemoryVaultStore } from '@core/vault/memory-store';
import { NOW_MS, TODAY } from '../../helpers/time';
import { MODULE, wikiFixture } from './fixtures';

const SCHEMA_DOC_RAW = readFileSync(
  new URL('../../../docs/MODULE-SCHEMA.md', import.meta.url),
  'utf8',
);
// docs/MODULE-SCHEMA.md carries a leading HTML-comment banner naming the code as
// authoritative (see src/core/wiki/agents-md.ts). That banner is repo-only — it must not
// leak into a user's vault — so strip exactly one leading `<!-- ... -->` comment (and the
// blank line(s) after it) before comparing byte-for-byte against the template body.
const SCHEMA_DOC = SCHEMA_DOC_RAW.replace(/^<!--[\s\S]*?-->\n+/, '');

function emptyStore(): MemoryVaultStore {
  return new MemoryVaultStore({ now: new Date(NOW_MS) });
}

describe('createModule', () => {
  it('legt Modulbeschreibung, Katalog, Chronik, Synthese und AGENTS.md an', async () => {
    const store = emptyStore();
    const result = await createModule(
      store,
      { title: 'Zweites Gehirn: Methodik', description: 'Wie Wissen nicht verrottet.' },
      { now: NOW_MS },
    );

    expect(result.slug).toBe('zweites-gehirn-methodik');
    expect(result.created).toEqual([
      'modules/zweites-gehirn-methodik/module.md',
      'modules/zweites-gehirn-methodik/wiki/overview.md',
      'modules/zweites-gehirn-methodik/wiki/index.md',
      'modules/zweites-gehirn-methodik/wiki/log.md',
      'modules/zweites-gehirn-methodik/AGENTS.md',
    ]);
    expect(result.module.counts).toEqual({ sources: 0, entities: 0, concepts: 0 });
    expect(result.module.lastIngest).toBeNull();
    expect(result.module.findingCount).toBe(0);
  });

  it('gibt module.md den Typ note plus Slug und Beschreibung', async () => {
    const store = emptyStore();
    await createModule(
      store,
      { title: 'Identität', description: 'Rollen und Mandanten.' },
      {
        now: NOW_MS,
      },
    );

    const doc = await store.read('modules/identitaet/module.md');
    expect(doc?.frontmatter['type']).toBe('note');
    expect(doc?.frontmatter['slug']).toBe('identitaet');
    expect(doc?.frontmatter['module']).toBe('identitaet');
    expect(doc?.frontmatter['description']).toBe('Rollen und Mandanten.');
    expect(doc?.frontmatter['created']).toBe(TODAY);
    expect(doc?.body).toContain('Rollen und Mandanten.');
  });

  it('schreibt Startinhalte in der Dokumentsprache', async () => {
    const store = emptyStore();
    await createModule(store, { title: 'Prompt patterns' }, { now: NOW_MS, docLanguage: 'en' });

    expect(await store.readText('modules/prompt-patterns/wiki/index.md')).toContain(
      '# Catalogue — Prompt patterns',
    );
    expect(await store.readText('modules/prompt-patterns/wiki/log.md')).toContain('# Chronicle');
    const overview = await store.read('modules/prompt-patterns/wiki/overview.md');
    expect(overview?.frontmatter['type']).toBe('overview');
    expect(overview?.frontmatter['module']).toBe('prompt-patterns');
    expect(overview?.body).toContain('## What is settled');
  });

  it('ist idempotent: ein zweiter Aufruf ruehrt keine Datei an', async () => {
    const store = emptyStore();
    await createModule(
      store,
      { title: 'Identity', description: 'Erste Fassung.' },
      { now: NOW_MS },
    );
    const before = store.snapshot();

    const again = await createModule(
      store,
      { title: 'Identity', description: 'Andere Fassung.' },
      { now: NOW_MS },
    );

    expect(again.created).toEqual([]);
    expect(again.module.description).toBe('Erste Fassung.');
    expect(store.snapshot()).toEqual(before);
  });

  it('legt fehlende Dateien eines von Hand gebauten Moduls nach', async () => {
    const store = new MemoryVaultStore({
      files: { 'modules/handarbeit/wiki/concepts/idee.md': '---\ntype: concept\n---\n\nText.\n' },
      now: new Date(NOW_MS),
    });

    const result = await createModule(store, { title: 'Handarbeit' }, { now: NOW_MS });

    expect(result.created).toContain('modules/handarbeit/module.md');
    expect(await store.readText('modules/handarbeit/wiki/concepts/idee.md')).toContain('Text.');
  });

  it('verweigert ein Modul ohne Titel', async () => {
    await expect(createModule(emptyStore(), { title: '   ' })).rejects.toThrow(/Titel/);
  });
});

describe('AGENTS.md', () => {
  it('traegt den Modulnamen und laesst keinen Platzhalter stehen', async () => {
    const store = emptyStore();
    await createModule(store, { title: 'Identitätsmanagement' }, { now: NOW_MS });

    const agents = await store.readText(agentsPath('identitaetsmanagement'));
    expect(agents).toContain('# Wissens-Modul: Identitätsmanagement');
    expect(agents).toContain('modules/identitaetsmanagement/wiki/');
    expect(agents).toContain('modules/identitaetsmanagement/AGENTS.md');
    expect(agents).not.toContain('modules/<slug>');
    expect(agents).toContain('## Widersprüche');
  });

  it('laesst die Namensregel der Source-Seiten Platzhalter bleiben', () => {
    // `s-YYYY-MM-DD-<slug>` meint den Slug der Quelle, nicht den des Moduls —
    // eingesetzt waere daraus eine Regel, die niemand befolgen kann.
    const rendered = renderAgentsMd('identitaetsmanagement', 'Identitätsmanagement');
    expect(rendered).toContain('`s-YYYY-MM-DD-<slug>`');
    expect(rendered).toContain('s-YYYY-MM-DD-<slug>.md');
  });

  it('benennt das Modul auch auf Englisch und macht Repo-Links zu Text', () => {
    const rendered = renderAgentsMd('prompt-patterns', 'Prompt patterns', 'en');
    expect(rendered).toContain('# Knowledge module: Prompt patterns');
    expect(rendered).not.toContain('](VAULT-FORMAT.md)');
    expect(rendered).toContain('VAULT-FORMAT.md');
  });

  it('bleibt Zeichen fuer Zeichen die Vorlage aus docs/MODULE-SCHEMA.md', () => {
    // Driftet die Kopie, faellt dieser Test — nicht der Nutzer, der den Vault liest.
    expect(MODULE_SCHEMA_TEMPLATE).toBe(SCHEMA_DOC);
  });

  it('laesst ein von Hand bearbeitetes AGENTS.md unberuehrt', async () => {
    // Guardrail 2: ein Schema-Text ist Inhalt, nicht abgeleiteter Index — ein
    // zweiter createModule-Aufruf darf ihn nicht durch die Vorlage ersetzen.
    const store = emptyStore();
    const first = await createModule(store, { title: 'Identity' }, { now: NOW_MS });
    const path = agentsPath(first.slug);
    const handEdited = '# Identity (angepasst)\n\nEigene Notizen des Nutzers.\n';
    await store.writeText(path, handEdited);

    const again = await createModule(store, { title: 'Identity' }, { now: NOW_MS });

    expect(await store.readText(path)).toBe(handEdited);
    expect(again.created).not.toContain(path);
  });

  it('schreibt in einem englischsprachigen Vault nur die Titelzeile englisch', async () => {
    const store = emptyStore();
    const result = await createModule(
      store,
      { title: 'Prompt patterns' },
      { now: NOW_MS, docLanguage: 'en' },
    );
    const path = agentsPath(result.slug);

    const agents = await store.readText(path);
    expect(agents).toContain('# Knowledge module: Prompt patterns');
    // Der Schema-Rumpf bleibt der eine feste deutsche Text (Entscheidung Sprint 023).
    expect(agents).toContain('## Widersprüche');

    const index = await IndexService.open(store, {
      persistence: null,
      now: () => new Date(NOW_MS),
    });
    const module = listModules(index).find((entry) => entry.slug === result.slug);
    expect(module?.title).toBe('Prompt patterns');

    // AGENTS.md liegt ausserhalb von modules/<slug>/wiki/ — der Seitengraph und
    // damit auch der Pflegelauf (kaputte Links) duerfen es nicht als Seite sehen.
    expect(index.pages().some((page) => page.path === path)).toBe(false);
    expect(index.index().brokenLinks.some((link) => link.path === path)).toBe(false);
  });
});

describe('listModules', () => {
  it('zaehlt die Seiten und nimmt den letzten Ingest aus der Chronik', async () => {
    const fixture = await wikiFixture();

    const modules = listModules(fixture.index);
    const module = modules.find((entry) => entry.slug === MODULE);

    expect(module?.title).toBe('Identitätsmanagement');
    expect(module?.counts).toEqual({ sources: 1, entities: 2, concepts: 1 });
    expect(module?.lastIngest).toBe('2026-08-04');
    expect(module?.findingCount).toBe(0);
  });

  it('meldet ein frisches Modul ohne Ingest ehrlich mit null', async () => {
    const store = emptyStore();
    await createModule(store, { title: 'Frisch' }, { now: NOW_MS });
    const fixture = await wikiFixture(store.snapshot());

    const module = listModules(fixture.index).find((entry) => entry.slug === 'frisch');
    expect(module?.lastIngest).toBeNull();
    expect(parse(await fixture.text('modules/frisch/module.md')).frontmatter['type']).toBe('note');
  });
});
