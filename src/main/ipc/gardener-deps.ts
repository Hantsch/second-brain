/* Die Verdrahtung des Pflegelaufs — an genau einer Stelle.

   Der Kern rechnet (`@core/gardener`), hier kommt zusammen, was er nicht kennt:
   der Index als Lesesicht, die Schwellen aus den Vault-Einstellungen, die
   Sprachen, die Beschriftungen der Oberfläche und das Gateway.

   Zwei Entscheidungen, die man im Code sonst nicht sieht:

   - **Der Lauf ruft die Checks selbst auf, statt `runGardener` zu nehmen.** Genau
     deshalb: `runGardener` ist ein Aufruf ohne Zwischenstand, und ein Lauf ohne
     Zwischenstand ist ein Lauf ohne Fortschritt und ohne Abbruch. Zwischen zwei
     Prüfungen wird der Ereignisschleife das Wort gegeben — sonst käme das
     Fortschritts-Ereignis erst, wenn schon alles fertig ist, und ein `cancel`
     nie an. Die Reihenfolge (deterministisch, dann Deutung, dann Ordnung, dann
     Zahl) ist dieselbe wie in `core/gardener/report.ts`.
   - **Ausgeblendete Befunde werden hier *nicht* herausgefiltert.** Der Lauf legt
     alles ab, was er gefunden hat; „passt so" filtert erst beim Lesen
     (`gardener-state.ts`). Sonst wäre ein zurückgenommenes „passt so" nur mit
     einem neuen Lauf wieder sichtbar. */

import { CHECKS, auditFindings, buildContext, sortFindings, vaultSize } from '@core/gardener';
import type { GardenerDeps, GardenerIndexView } from '@core/gardener';
import type { DocLanguage, GardenerSettings, UiLanguage } from '@shared/types';
import { fail } from './errors';
import { docLanguage, replyLanguage } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import { gardenerLabels } from '../gardener-labels';
import { gardenerState } from '../gardener-state';
import type { GardenerState, StoredRun } from '../gardener-state';
import type { IndexLike } from '../contracts';
import type { Services } from '../services';

/** Was der Pflegelauf am Index braucht — `IndexService` erfüllt es strukturell. */
const GARDENER_INDEX_METHODS: readonly string[] = [
  'index',
  'pages',
  'projects',
  'sources',
  'dumps',
];

function knowsGardener(index: IndexLike): index is IndexLike & GardenerIndexView {
  const record = index as unknown as Record<string, unknown>;
  return GARDENER_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/**
 * Der Index als Lesesicht des Pflegelaufs. Fehlt eine Ableitung, sagt der Kanal
 * das — ein Bericht ohne Bestand wäre eine Behauptung über einen Vault, den
 * niemand gelesen hat.
 */
export function gardenerIndex(services: Services): GardenerIndexView {
  const index = services.requireIndex();
  if (!knowsGardener(index)) throw fail('io', 'der Index liefert keine Pflege-Ableitungen');
  return index;
}

/** Der Pflegezustand dieses Vaults, aus `.secondbrain/gardener.json`. */
export function gardenerStateFor(services: Services): Promise<GardenerState> {
  return gardenerState(services.requireVaultRoot());
}

/** Die Pflege-Einstellungen des offenen Vaults, soweit gesetzt. */
export function gardenerSettings(services: Services): Partial<GardenerSettings> | undefined {
  return services.settings.vault()?.gardener;
}

function deps(services: Services, signal?: AbortSignal): GardenerDeps {
  const documents: DocLanguage = docLanguage(services);
  const reply: UiLanguage = replyLanguage(services);
  return {
    index: gardenerIndex(services),
    gateway: createGateway(services),
    labels: gardenerLabels(services.settings.uiLanguage()),
    docLanguage: documents,
    replyLanguage: reply,
    now: new Date(),
    ...(signal === undefined ? {} : { signal }),
  };
}

export interface RunOptions {
  /** Überschreibt `gardener.useLlm` für diesen Lauf. */
  useLlm?: boolean;
  signal?: AbortSignal;
  /** Fortschritt melden — im Kanal die Ereignisse, im Autostart nichts. */
  onProgress?: (progress: {
    phase: 'checks' | 'audit' | 'done';
    check: (typeof CHECKS)[number]['kind'] | null;
    done: number;
    total: number;
    running: boolean;
  }) => void;
}

/** Der Ereignisschleife das Wort geben, damit Fortschritt und Abbruch durchkommen. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function stopIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw fail('cancelled', 'der Pflegelauf wurde abgebrochen');
}

/**
 * Ein Lauf mit Fortschritt. Gibt den **rohen** Lauf zurück: alle Befunde, dazu
 * die Größe des Bestands als Bezug der Gesundheit.
 */
export async function runWithProgress(
  services: Services,
  options: RunOptions = {},
): Promise<StoredRun> {
  const settings = services.settings.vault();
  const run = deps(services, options.signal);
  const ctx = buildContext(run, { ...(settings === null ? {} : { settings }) });
  /* Gewollt ist eine Sache, möglich eine andere: ohne Route für `gardener-audit`
     gibt es keine Deutungs-Phase — auch keine gemeldete. Ein Fortschritt, der
     „das Modell deutet die Befunde" sagt, während keins erreichbar ist, wäre
     genau die Behauptung, die dieser Screen nicht machen darf. */
  const wanted = options.useLlm ?? settings?.gardener.useLlm ?? false;
  const useLlm = wanted && run.gateway.isAvailable('gardener-audit');
  const total = CHECKS.length + (useLlm ? 1 : 0);

  const deterministic = [];
  let done = 0;
  for (const check of CHECKS) {
    stopIfCancelled(options.signal);
    options.onProgress?.({
      phase: 'checks',
      check: check.kind,
      done,
      total,
      running: true,
    });
    await tick();
    stopIfCancelled(options.signal);
    deterministic.push(...check.run(ctx));
    done += 1;
  }

  let audit = null;
  if (useLlm) {
    options.onProgress?.({ phase: 'audit', check: null, done, total, running: true });
    await tick();
    stopIfCancelled(options.signal);
    audit = await auditFindings(ctx, deterministic, {
      gateway: run.gateway,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    done += 1;
  }

  const rejected = new Set(audit?.rejected ?? []);
  const findings = sortFindings(
    [...deterministic, ...(audit?.contradictions ?? [])].filter(
      (finding) => !rejected.has(finding.id),
    ),
  );
  options.onProgress?.({ phase: 'done', check: null, done, total, running: false });

  return {
    ranAt: ctx.ranAt,
    usedLlm: audit?.usedLlm ?? false,
    findings,
    advice: audit?.advice ?? [],
    size: vaultSize(run.index),
  };
}
