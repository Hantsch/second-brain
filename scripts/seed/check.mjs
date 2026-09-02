/* Der Seed prüft sich selbst. Zwei Fragen:
   1. Ist jede erzeugte Datei formal in Ordnung (Frontmatter parsebar, `type`
      und `title` vorhanden)?
   2. Stehen genau die absichtlichen Befunde drin — und keine unabsichtlichen?

   Damit ist der Demo-Vault auch ein Prüfstein für den Pflege-Screen: was hier
   gezählt wird, muss der Gardener finden. */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';

const PARSE_OPTIONS = { schema: 'core', version: '1.2' };
const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const STALE_AFTER_DAYS = 120;
const UNFILED_AFTER_DAYS = 14;

/** Alle Dateien unter `dir`, Pfade vault-relativ mit '/'. */
function walk(root, dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) walk(root, absolute, out);
    else out.push(relative(root, absolute).replace(/\\/g, '/'));
  }
  return out;
}

function splitDoc(content) {
  const lines = content.split('\n');
  if ((lines[0] ?? '').trimEnd() !== '---') return { frontmatter: null, body: content };
  const closing = lines.findIndex((line, index) => index > 0 && line.trimEnd() === '---');
  if (closing < 0) return { frontmatter: null, body: content };
  const raw = lines.slice(1, closing).join('\n');
  return {
    frontmatter: parseYaml(raw, PARSE_OPTIONS) ?? {},
    body: lines.slice(closing + 1).join('\n'),
  };
}

function daysBetween(isoDate, today) {
  const value = Date.parse(`${String(isoDate).slice(0, 10)}T00:00:00`);
  return Math.round((today.getTime() - value) / 86_400_000);
}

/** Braucht diese Datei Frontmatter mit `type` und `title`? */
function isKnowledgeDoc(path) {
  if (path.endsWith('/wiki/index.md') || path.endsWith('/wiki/log.md')) return false;
  if (path === 'README.md') return false;
  if (path.startsWith('raw/')) return false;
  return path.endsWith('.md');
}

function moduleOf(path) {
  const match = /^modules\/([^/]+)\/wiki\//.exec(path);
  return match ? match[1] : null;
}

function pageSlug(path) {
  return path.replace(/^.*\//, '').replace(/\.md$/, '');
}

/** `areas/<slug>.md` (not `.condensed.md`), keyed by slug. */
function areaSlugOf(path) {
  const match = /^areas\/([^/]+)\.md$/.exec(path);
  return match ? match[1] : null;
}

/** `areas/<slug>.condensed.md`, keyed by slug. */
function condensedSlugOf(path) {
  const match = /^areas\/([^/]+)\.condensed\.md$/.exec(path);
  return match ? match[1] : null;
}

export function checkVault(root, today = new Date()) {
  const files = walk(root);
  const problems = [];
  const pages = new Map();
  const dumps = [];
  const projects = [];
  const rawLogs = [];
  const areas = new Map();
  const condensed = new Map();

  for (const path of files) {
    const content = readFileSync(join(root, path), 'utf8');
    let parsed;
    try {
      parsed = splitDoc(content);
    } catch (error) {
      problems.push(`${path}: Frontmatter ist kein gültiges YAML (${error.message})`);
      continue;
    }
    if (path.endsWith('.ingest.json')) {
      rawLogs.push({ path, data: JSON.parse(content) });
      continue;
    }
    if (!path.endsWith('.md')) continue;
    const fields = parsed.frontmatter;
    if (isKnowledgeDoc(path)) {
      if (!fields) {
        problems.push(`${path}: kein Frontmatter`);
        continue;
      }
      if (typeof fields.type !== 'string') problems.push(`${path}: Feld 'type' fehlt`);
      if (typeof fields.title !== 'string') problems.push(`${path}: Feld 'title' fehlt`);
    }
    const module = moduleOf(path);
    if (module && fields) {
      pages.set(`${module}/${pageSlug(path)}`, { path, module, fields, body: parsed.body });
    }
    if (fields?.type === 'dump') dumps.push({ path, fields });
    if (fields?.type === 'project') projects.push({ path, fields });
    const areaSlug = areaSlugOf(path);
    if (areaSlug && fields?.type === 'area') areas.set(areaSlug, { path, fields });
    const condensedSlug = condensedSlugOf(path);
    if (condensedSlug) condensed.set(condensedSlug, { path, fields });
  }

  /* Wikilinks: Katalog und Chronik zählen nicht als eingehende Verweise —
     eine Seite, auf die nur der Katalog zeigt, ist verwaist. */
  const broken = [];
  const inbound = new Map([...pages.keys()].map((key) => [key, 0]));
  const listedInIndex = new Set();

  for (const [key, page] of pages) {
    for (const match of page.body.matchAll(WIKILINK)) {
      const target = match[1].trim();
      const resolved = target.includes('/') ? target : `${page.module}/${target}`;
      if (!pages.has(resolved)) broken.push(`${page.path} → [[${target}]]`);
      else if (resolved !== key) inbound.set(resolved, (inbound.get(resolved) ?? 0) + 1);
    }
    for (const source of page.fields.sources ?? []) {
      if (!pages.has(`${page.module}/${source}`)) {
        problems.push(`${page.path}: Quelle '${source}' hat keine Seite`);
      }
    }
  }

  for (const path of files.filter((file) => file.endsWith('/wiki/index.md'))) {
    const module = /^modules\/([^/]+)\//.exec(path)[1];
    const content = readFileSync(join(root, path), 'utf8');
    for (const match of content.matchAll(WIKILINK)) {
      const target = match[1].trim();
      const resolved = target.includes('/') ? target : `${module}/${target}`;
      if (!pages.has(resolved)) broken.push(`${path} → [[${target}]]`);
      listedInIndex.add(resolved);
    }
  }

  const orphans = [...inbound.entries()]
    .filter(([key, count]) => count === 0 && !key.endsWith('/overview'))
    .map(([key]) => key);
  const missingFromIndex = [...pages.keys()].filter((key) => !listedInIndex.has(key));
  const stalePages = [...pages.values()]
    .filter(
      (page) => daysBetween(page.fields.reviewed ?? page.fields.created, today) > STALE_AFTER_DAYS,
    )
    .map((page) => page.path);
  const contradictions = [...pages.values()].filter(
    (page) => Array.isArray(page.fields.contradicts) && page.body.includes('## Widersprüche'),
  );
  const unprocessedSources = rawLogs.filter((log) => !log.data.sourcePage).map((log) => log.path);
  const unfiledDumps = dumps
    .filter(
      (dump) =>
        dump.fields.status === 'raw' &&
        daysBetween(dump.fields.created, today) >= UNFILED_AFTER_DAYS,
    )
    .map((dump) => dump.path);
  const withoutNextStep = projects
    .filter((project) => !project.fields.next_step)
    .map((project) => project.path);

  /* Verdichtung fällig (Story 039): eine Area ohne Artefakt, oder ein Artefakt,
     dessen `sources:`-Eintrag keinen passenden `source_hashes:`-Wert trägt —
     „ein Quelleintrag ohne Hash gilt als geändert" (Decision, story 039). Kein
     Nachbau des echten Inhaltshash-Vergleichs (dafür bräuchte es den Index),
     nur dieselbe Frage, die der Gardener stellt: steht für jede Quelle ein Hash? */
  const condensationDue = [...areas.entries()]
    .filter(([slug]) => {
      const artifact = condensed.get(slug);
      if (!artifact) return true;
      const sources = Array.isArray(artifact.fields.sources) ? artifact.fields.sources : [];
      const hashes = artifact.fields.source_hashes ?? {};
      return sources.some((source) => !(source in hashes));
    })
    .map(([, area]) => area.path);

  return {
    files,
    problems,
    findings: {
      broken,
      orphans,
      missingFromIndex,
      stalePages,
      contradictions: contradictions.map((page) => page.path),
      unprocessedSources,
      unfiledDumps,
      withoutNextStep,
      condensationDue,
    },
  };
}

/** Was der Seed absichtlich einbaut. Abweichungen sind Fehler, nicht Zufall. */
export const EXPECTED_FINDINGS = {
  broken: 1,
  /* Two, deliberately: `scim` (identity-management, exactly one unambiguous
     mention — the regression case for the unchanged one-click fix) and
     `notiz-communities-interview` (second-brain-methodik, zero mention
     candidates — 016 D8's picker fixture). See the comment in
     module-methodik.mjs for why the second one stays at zero candidates. */
  orphans: 2,
  missingFromIndex: 1,
  stalePages: 1,
  contradictions: 2,
  unprocessedSources: 1,
  unfiledDumps: 1,
  withoutNextStep: 1,
  /* Story 039: `gesundheit` (Artefakt ohne `source_hashes`, gilt als geändert),
     `kunden-und-team` und `finanzen` (Material, kein Artefakt). */
  condensationDue: 3,
};

/** Vergleicht die gefundenen mit den erwarteten Befunden. */
export function compareFindings(findings) {
  const problems = [];
  for (const [kind, expected] of Object.entries(EXPECTED_FINDINGS)) {
    const actual = findings[kind] ?? [];
    if (actual.length !== expected) {
      problems.push(
        `Befund '${kind}': ${actual.length} statt ${expected} — ${actual.join('; ') || 'keiner'}`,
      );
    }
  }
  return problems;
}
