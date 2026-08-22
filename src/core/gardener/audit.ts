/**
 * Die optionale LLM-Deutung des Pflegelaufs.
 *
 * Sie laeuft nur, wenn `gardener.useLlm` gesetzt ist **und** fuer `gardener-audit`
 * eine Route steht. Faellt sie aus — kein Modell, kein Netz, kaputtes JSON —,
 * stehen die deterministischen Befunde trotzdem, und der Bericht sagt
 * `usedLlm: false`. Das ist Guardrail 1: die Pflege ist ohne Modell vollstaendig
 * benutzbar, nur aermer an Urteil.
 *
 * Das Modell darf genau drei Dinge:
 * 1. **Widersprueche benennen** — mit beiden Pfaden und einem Satz, worin der
 *    Konflikt besteht. Aufgeloest wird nie einer: der Fix schreibt hoechstens eine
 *    benannte Notiz (docs/MODULE-SCHEMA.md).
 * 2. **Kandidaten bestaetigen oder verwerfen** (Beinahe-Dublette, fehlende Seite).
 *    Ein verworfener Kandidat verschwindet, ein bestaetigter bleibt, wie er ist —
 *    die Schwere aendert kein Modell.
 * 3. **Hoechstens drei Saetze Rat** geben.
 *
 * Und es wird **hart geprueft**: jeder genannte Pfad muss im Index existieren,
 * sonst faellt der ganze Eintrag weg. Jede Kennung muss aus der Kandidatenliste
 * kommen. Eine erfundene Datei erscheint nie in der Oberflaeche.
 *
 * Was das Modell sieht, ist bewusst klein: die Befunde und die Ausschnitte der
 * betroffenen Seiten, dazu Seiten, die im Frontmatter schon einen Konflikt nennen.
 * Nie der ganze Vault — das waere teuer und, bei Tagebuch- und Projektinhalten,
 * eine Preisgabe ohne Anlass. Der Preis ist eine ehrliche Grenze: einen Widerspruch
 * zwischen zwei Seiten, die deterministisch nicht aufgefallen sind, findet dieser
 * Lauf nicht.
 */

import type { GardenerFinding, GardenerFindingKind, ModelRef, WikiPage } from '@shared/types';
import {
  GARDENER_AUDIT_SCHEMA,
  MAX_ADVICE,
  gardenerAuditPrompt,
  isAbortError,
  parseJsonLoose,
} from '@core/llm';
import type { AuditPageInput, LlmGateway } from '@core/llm';
import { collapse } from '@core/index/text';
import { excerpt } from '@core/vault/doc';
import { buildFinding, buildFix } from './types';
import type { GardenerContext } from './types';
import { contradictionLine, namesContradiction, relationSlugs } from './relations';

/**
 * Kandidaten-Arten, ueber die das Modell urteilen darf.
 *
 * Exportiert, weil ein Lauf mit Geltungsbereich (021c) vorher wissen muss, ob
 * die Deutungsstufe fuer ihn ueberhaupt etwas hervorbringen kann: ausser einem
 * Widerspruch ist ihr einziges Ergebnis ein Urteil ueber genau diese Arten.
 */
export const AUDIT_CANDIDATE_KINDS: readonly GardenerFindingKind[] = [
  'near-duplicate',
  'missing-page',
];

/** Hoechstzahl an Seiten, die in einen Audit-Prompt gehen. */
export const MAX_AUDIT_PAGES = 24;

/** Hoechstlaenge eines Rats. */
export const MAX_ADVICE_CHARS = 240;

/** Hoechstlaenge einer Widerspruchsnotiz — ein Satz. */
export const MAX_NOTE_CHARS = 300;

export interface AuditOptions {
  gateway: LlmGateway;
  signal?: AbortSignal;
}

export interface AuditResult {
  /** Hat ein Modell geantwortet und war die Antwort lesbar? */
  usedLlm: boolean;
  /** Neue Befunde der Art `contradiction`, schon geprueft. */
  contradictions: GardenerFinding[];
  /** Kennungen, die das Modell bestaetigt hat. */
  confirmed: string[];
  /** Kennungen, die das Modell verworfen hat — sie fallen aus dem Bericht. */
  rejected: string[];
  advice: string[];
  model: ModelRef | null;
}

function emptyResult(): AuditResult {
  return {
    usedLlm: false,
    contradictions: [],
    confirmed: [],
    rejected: [],
    advice: [],
    model: null,
  };
}

/** Alle Wiki-Seiten des Kontexts, nach Pfad greifbar. */
function pagesByPath(ctx: GardenerContext): Map<string, WikiPage> {
  const map = new Map<string, WikiPage>();
  for (const module of ctx.modules) for (const page of module.pages) map.set(page.path, page);
  return map;
}

/**
 * Die Seiten, ueber die geurteilt wird: erst die von den Befunden beruehrten, dann
 * die Partner benannter Beziehungen. Deterministisch sortiert, damit derselbe
 * Bestand denselben Prompt ergibt.
 */
export function auditPages(
  ctx: GardenerContext,
  findings: readonly GardenerFinding[],
): AuditPageInput[] {
  const pages = pagesByPath(ctx);
  const { byPath } = ctx.index.index();
  const chosen: string[] = [];
  const take = (path: string): void => {
    if (pages.has(path) && !chosen.includes(path)) chosen.push(path);
  };

  for (const finding of [...findings].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const path of finding.paths) take(path);
  }
  /* Seiten mit benannter Beziehung: sie tragen den Hinweis auf einen Konflikt im
     Frontmatter, ohne dass ein Check darauf anspringt. */
  for (const module of ctx.modules) {
    for (const page of module.pages) {
      const slugs = relationSlugs(byPath.get(page.path)?.frontmatter ?? {});
      if (slugs.length === 0) continue;
      take(page.path);
      for (const slug of slugs) {
        const partner = module.pages.find((candidate) => candidate.slug === slug);
        if (partner !== undefined) take(partner.path);
      }
    }
  }

  return chosen.slice(0, MAX_AUDIT_PAGES).map((path) => {
    const page = pages.get(path);
    const doc = byPath.get(path);
    const named = relationSlugs(doc?.frontmatter ?? {});
    return {
      path,
      title: page?.title ?? path,
      excerpt: excerpt(doc?.body ?? '', 900),
      ...(named.length > 0 ? { named } : {}),
    };
  });
}

interface RawContradiction {
  pathA: string;
  pathB: string;
  note: string;
}

function readContradictions(value: unknown): RawContradiction[] {
  if (!Array.isArray(value)) return [];
  const result: RawContradiction[] = [];
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const pathA = typeof record['pathA'] === 'string' ? record['pathA'].trim() : '';
    const pathB = typeof record['pathB'] === 'string' ? record['pathB'].trim() : '';
    const note = typeof record['note'] === 'string' ? collapse(record['note']) : '';
    if (pathA.length === 0 || pathB.length === 0 || note.length === 0) continue;
    result.push({ pathA, pathB, note: note.slice(0, MAX_NOTE_CHARS) });
  }
  return result;
}

function readIds(value: unknown, allowed: ReadonlySet<string>): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = entry.trim();
    if (allowed.has(id) && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function readAdvice(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const advice: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const text = collapse(entry).slice(0, MAX_ADVICE_CHARS);
    if (text.length > 0 && !advice.includes(text)) advice.push(text);
    if (advice.length >= MAX_ADVICE) break;
  }
  return advice;
}

/**
 * Ein Widerspruch wird zum Befund — oder verworfen. Verworfen wird, wenn ein Pfad
 * nicht existiert, beide Pfade dieselbe Seite sind oder einer keine Wiki-Seite ist.
 */
function toFinding(
  ctx: GardenerContext,
  raw: RawContradiction,
  pages: ReadonlyMap<string, WikiPage>,
): GardenerFinding | null {
  const first = pages.get(raw.pathA);
  const second = pages.get(raw.pathB);
  if (first === undefined || second === undefined || first.path === second.path) return null;
  const [a, b] = first.path <= second.path ? [first, second] : [second, first];
  const { byPath } = ctx.index.index();
  const docA = byPath.get(a.path);
  const docB = byPath.get(b.path);
  if (docA === undefined || docB === undefined) return null;
  const named = namesContradiction(docA, b.slug) || namesContradiction(docB, a.slug);
  const text = ctx.labels.contradiction(a.title, b.title, raw.note, named);
  return buildFinding(ctx, {
    kind: 'contradiction',
    /* Ein benannter Konflikt ist der gewuenschte Endzustand — er wird gezeigt,
       aber er zieht die Gesundheit nicht nach unten. */
    severity: named ? 'info' : 'high',
    title: text.title,
    detail: text.detail,
    paths: [a.path, b.path],
    module: a.module === b.module ? a.module : null,
    key: [a.path, b.path],
    /* Die Vorschau ist wortwoertlich die Zeile, die `applyFix` in den Abschnitt
       „Widersprueche" von `paths[0]` anhaengt. Mehr passiert nicht: aufgeloest wird
       ein Widerspruch nie. */
    fix: named
      ? null
      : buildFix(
          ctx,
          'add-links',
          contradictionLine(b.slug, raw.note, ctx.docLanguage),
          'contradiction',
        ),
  });
}

/**
 * Die Befunde deuten lassen. Wirft nur, wenn der Aufrufer abbricht — jeder andere
 * Fehler endet in `usedLlm: false`.
 */
export async function auditFindings(
  ctx: GardenerContext,
  findings: readonly GardenerFinding[],
  options: AuditOptions,
): Promise<AuditResult> {
  if (!options.gateway.isAvailable('gardener-audit')) return emptyResult();

  const candidateIds = findings
    .filter((finding) => AUDIT_CANDIDATE_KINDS.includes(finding.kind))
    .map((finding) => finding.id);
  const pages = auditPages(ctx, findings);
  /* Ohne Seiten gibt es nichts zu deuten: kein Aufruf, keine Kosten, kein Datenabfluss. */
  if (pages.length === 0) return emptyResult();

  try {
    const result = await options.gateway.complete({
      task: 'gardener-audit',
      messages: gardenerAuditPrompt(
        {
          today: ctx.today,
          findings: findings.map((finding) => ({
            id: finding.id,
            kind: finding.kind,
            title: finding.title,
            paths: finding.paths,
          })),
          pages,
          candidateIds,
        },
        ctx.docLanguage,
        ctx.replyLanguage,
      ),
      schema: GARDENER_AUDIT_SCHEMA,
      temperature: 0,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const parsed = parseJsonLoose<Record<string, unknown>>(result.text);
    const allowed = new Set(candidateIds);
    const known = pagesByPath(ctx);
    const contradictions: GardenerFinding[] = [];
    for (const raw of readContradictions(parsed['contradictions'])) {
      const finding = toFinding(ctx, raw, known);
      if (finding === null) continue;
      if (contradictions.some((existing) => existing.id === finding.id)) continue;
      contradictions.push(finding);
    }

    return {
      usedLlm: true,
      contradictions,
      confirmed: readIds(parsed['confirmed'], allowed),
      rejected: readIds(parsed['rejected'], allowed),
      advice: readAdvice(parsed['advice']),
      model: result.model,
    };
  } catch (error) {
    // Nur ein Abbruch des Aufrufers ist ein echter Abbruch; alles andere ist ein
    // Lauf ohne Deutung — die deterministischen Befunde bleiben.
    if (isAbortError(error)) throw error;
    return emptyResult();
  }
}
