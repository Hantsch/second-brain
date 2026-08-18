/* Gemeinsame Testdaten des Index. Bewusst keine `.test.ts`-Datei, damit vitest sie
   nicht als Suite sammelt.

   Der Beispiel-Vault ist absichtlich nah an docs/VAULT-FORMAT.md: Umlaute, alle
   Inline-Marker, verschachtelte Checkboxen, ein Code-Zaun, zwei Module, ein
   kaputter Wikilink und eine Rohquelle mit `.ingest.json`. */

import { MemoryVaultStore } from '@core/vault/memory-store';
import { sha256 } from '@core/vault/hash';
import type { IndexedDoc } from '@core/index/types';

/** Der Tag, auf den sich alle Fristen in den Tests beziehen. */
export const TODAY = '2026-08-10';

export const NYOTA_PROJECT = [
  '---',
  'type: project',
  'title: Nyota Auth0 Migration',
  'slug: nyota-auth0-migration',
  'scope: work',
  'status: active',
  'priority: 2',
  'started: 2026-06-12',
  'deadline: 2026-09-01',
  'next_step: Rückmeldung von Stefan zur Rollenzuordnung einarbeiten',
  'tags: [auth0, infrastruktur]',
  'modules: [identity-management]',
  "repos: ['C:/development/Kunde/Nyota-Auth0-Infrastructure']",
  'waiting_on:',
  '  - who: Stefan',
  '    what: Freigabe des Rollenkonzepts',
  '    since: 2026-08-04',
  '    due: 2026-08-12',
  '---',
  '',
  '## Stand',
  '',
  'Das Rollenkonzept liegt bei Stefan und blockiert den Testmandanten. Die',
  'Rückmeldung fehlt seit einer Woche.',
  '',
  '## Todos',
  '',
  '- [ ] Rollen-Mapping dokumentieren @due:2026-08-15 !!',
  '  - [ ] Übersicht der Gruppen prüfen @wait:Anna #rbac',
  '- [x] Terraform-State migriert @done:2026-08-09',
  '- [ ] Antwort von Auth0 abwarten @needed:2026-08-20 !!! @wait:"Auth0 Support"',
  '',
  '```markdown',
  '- [ ] Beispiel aus der Doku, das kein Todo ist',
  '```',
  '',
  '## Notizen',
  '',
  '### 2026-08-10',
  '',
  'Terraform-State liegt jetzt im Remote-Backend.',
  '',
].join('\n');

const NYOTA_NOTE = [
  '---',
  'type: note',
  'title: Rollen im Detail',
  'created: 2026-07-20',
  '---',
  '',
  'Das Rollenkonzept unterscheidet drei Ebenen.',
  '',
  '- [ ] Vererbung der Rollen nachlesen',
  '',
].join('\n');

const KELLER_PROJECT = [
  '---',
  'type: project',
  'title: Keller ausbauen',
  'slug: keller-ausbau',
  'scope: private',
  'status: paused',
  '---',
  '',
  'Der Keller ist ausgeräumt, der Rest wartet auf den Frühling.',
  '',
  '## Todos',
  '',
  '- [ ] Feuchtigkeit messen',
  '',
].join('\n');

const JOURNAL = [
  '---',
  'type: journal',
  'title: Montag, 10. August 2026',
  'date: 2026-08-10',
  'mood: 3',
  'scope: work',
  'people: [Stefan]',
  'tags: [stress]',
  '---',
  '',
  '## Tag',
  '',
  'Der Sprint fühlt sich unmöglich an, aber die Migration bewegt sich.',
  '',
  '## Fakten',
  '',
  '- [ ] Stefan wegen Rollenkonzept nachfassen @due:2026-08-12',
  '',
].join('\n');

const AREA = [
  '---',
  'type: area',
  'title: Gesundheit',
  '---',
  '',
  'Laufen, schlafen, weniger Kaffee.',
  '',
  '- [ ] Zahnarzttermin holen #privat',
  '- [ ] Arbeitsplatz höher stellen #work',
  '',
  '## Notizen',
  '',
  '### 2026-07-28',
  '',
  'Der Rücken meldet sich vor allem bei langen Sitzungen.',
  '',
  '### 2026-08-04',
  '',
  'Zwei Wochen Schlafprotokoll: vor Mitternacht ins Bett wirkt mehr.',
  '',
].join('\n');

const DUMP = [
  '---',
  'type: dump',
  'title: Gedanke zur Suche',
  'created: 2026-08-10T14:32:11+02:00',
  'origin: quick-capture',
  'status: raw',
  'tags: []',
  '---',
  '',
  'Die Suche müsste auch Teilwörter im Rollenkonzept finden.',
  '',
].join('\n');

const MODULE = [
  '---',
  'type: note',
  'title: Identity Management',
  'created: 2026-07-01',
  '---',
  '',
  'Alles über Zugriff, Rollen und Anmeldung.',
  '',
].join('\n');

const WIKI_INDEX = [
  '---',
  'type: note',
  'title: Katalog',
  'module: identity-management',
  '---',
  '',
  '- [[auth0]] — der Anbieter.',
  '- [[rollenbasierte-zugriffskontrolle]] — das Konzept.',
  '',
].join('\n');

const WIKI_OVERVIEW = [
  '---',
  'type: overview',
  'title: Überblick Identity Management',
  'module: identity-management',
  'created: 2026-07-01',
  '---',
  '',
  'Das Modul beschreibt [[auth0]] und [[rollenbasierte-zugriffskontrolle]].',
  '',
].join('\n');

const WIKI_SOURCE = [
  '---',
  'type: source',
  'title: Auth0 RBAC Guide',
  'module: identity-management',
  'created: 2026-07-02',
  'tags: [auth, rbac]',
  '---',
  '',
  'Der Leitfaden erklärt Rollen und Berechtigungen.',
  '',
].join('\n');

const WIKI_ENTITY = [
  '---',
  'type: entity',
  'title: Auth0',
  'module: identity-management',
  'created: 2026-07-02',
  'tags: [auth]',
  'sources: [s-2026-07-02-auth0-rbac-guide]',
  '---',
  '',
  'Auth0 ist der Anbieter (source: [[s-2026-07-02-auth0-rbac-guide]]).',
  'Siehe auch [[second-brain-methodik/karpathy]] und [[gibt-es-nicht]].',
  '',
  '```md',
  'In einem Beispiel steht [[nur-ein-beispiel]].',
  '```',
  '',
].join('\n');

const WIKI_CONCEPT = [
  '---',
  'type: concept',
  'title: Rollenbasierte Zugriffskontrolle',
  'module: identity-management',
  'created: 2026-07-02',
  'tags: [auth, rbac]',
  '---',
  '',
  'Das Rollenkonzept vergibt Rechte an Rollen statt an Personen',
  '(source: [[s-2026-07-02-auth0-rbac-guide]]). Die Rückmeldung von [[auth0|Auth0]]',
  'steht noch aus.',
  '',
].join('\n');

const KARPATHY = [
  '---',
  'type: entity',
  'title: Andrej Karpathy',
  'module: second-brain-methodik',
  'created: 2026-08-01',
  '---',
  '',
  'Beschreibt das Wiki-Schema, dem die Module folgen.',
  '',
].join('\n');

const INGEST_JSON = [
  '{',
  '  "kind": "youtube",',
  '  "origin": "https://www.youtube.com/watch?v=xOFkpf9KgKg",',
  '  "ingestedAt": "2026-08-10T14:40:00+02:00",',
  '  "title": "Your AI Second Brain Is Slowly Rotting",',
  '  "sourcePage": "s-2026-08-10-ai-second-brain-rotting",',
  '  "modules": ["second-brain-methodik"]',
  '}',
  '',
].join('\n');

const TRANSCRIPT = [
  '---',
  'type: note',
  'title: Transkript',
  '---',
  '',
  'Ein Second Brain verrottet, wenn niemand es pflegt.',
  '',
].join('\n');

/** Der Beispiel-Vault als Pfad → Inhalt. Reihenfolge = Alter (spaeter ist juenger). */
export function vaultFiles(): Record<string, string> {
  return {
    'modules/identity-management/module.md': MODULE,
    'modules/identity-management/wiki/index.md': WIKI_INDEX,
    'modules/identity-management/wiki/overview.md': WIKI_OVERVIEW,
    'modules/identity-management/wiki/sources/s-2026-07-02-auth0-rbac-guide.md': WIKI_SOURCE,
    'modules/identity-management/wiki/entities/auth0.md': WIKI_ENTITY,
    'modules/identity-management/wiki/concepts/rollenbasierte-zugriffskontrolle.md': WIKI_CONCEPT,
    'modules/second-brain-methodik/wiki/entities/karpathy.md': KARPATHY,
    'projects/work/nyota-auth0-migration/project.md': NYOTA_PROJECT,
    'projects/work/nyota-auth0-migration/notes/rollen.md': NYOTA_NOTE,
    'projects/private/keller-ausbau/project.md': KELLER_PROJECT,
    'areas/gesundheit.md': AREA,
    'journal/2026/08/2026-08-10.md': JOURNAL,
    'raw/youtube/xOFkpf9KgKg/.ingest.json': INGEST_JSON,
    'raw/youtube/xOFkpf9KgKg/transcript.md': TRANSCRIPT,
    'inbox/2026-08-10-1432-gedanke-zur-suche.md': DUMP,
  };
}

/** Beispiel-Vault im Speicher. */
export function vaultStore(): MemoryVaultStore {
  return new MemoryVaultStore({ files: vaultFiles(), now: new Date('2026-08-09T08:00:00.000Z') });
}

/**
 * Speicher-Store, der mitschreibt, welche Dateien gelesen wurden — die Grundlage
 * des Beweises, dass ein inkrementeller Lauf nichts Unveraendertes anfasst.
 */
export class CountingStore extends MemoryVaultStore {
  readonly reads: string[] = [];

  override async readText(path: string): Promise<string | null> {
    this.reads.push(path);
    return super.readText(path);
  }

  /** Nur die Markdown-Dateien — `.ingest.json` liest jeder Lauf. */
  markdownReads(): string[] {
    return this.reads.filter((path) => path.endsWith('.md'));
  }
}

/** Ein indiziertes Dokument von Hand, fuer Ableitungstests ohne Dateien. */
export function makeDoc(partial: Partial<IndexedDoc> & { path: string }): IndexedDoc {
  const body = partial.body ?? '';
  return {
    docType: 'note',
    title: partial.path,
    tags: [],
    lang: null,
    updated: '2026-08-10T09:00:00.000Z',
    hash: sha256(body),
    size: body.length,
    words: body.split(/\s+/).filter((word) => word.length > 0).length,
    bodyLine: 1,
    frontmatter: {},
    module: null,
    scope: null,
    project: null,
    ...partial,
    body,
    text: body.toLowerCase(),
  };
}
