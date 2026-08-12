/* Die Verdrahtung des Überblicks — an genau einer Stelle.

   Drei Kanalgruppen hängen an `@core/overview` und `@core/claude`: das Dashboard,
   die Erinnerungen und die Sessions. Sie brauchen dieselben vier Dinge — den
   Index als schmale Sicht, die Schwellen aus den Vault-Einstellungen, die
   Sitzungsliste und den Ruhezustand.

   Zwei Entscheidungen, die man im Code sonst nicht sieht:

   - **Die Sitzungen werden kurz gepuffert.** Ein Dashboard-Aufruf, ein
     Erinnerungs-Aufruf und die Sessions-Kachel fragen innerhalb einer Sekunde
     dreimal; `~/.claude` dreimal zu lesen wäre Verschwendung. Der Puffer gilt
     nur Sekunden und wird nach `claude:link` verworfen.
   - **Nach dem Sitzungslauf zieht der Index nach, ohne ein Ereignis zu
     schicken.** `lastTouch` und `stale` sollen die Sessions kennen; ein
     `event:vault-changed` würde das Dashboard invalidieren, das gerade fragt —
     eine Schleife. */

import { ClaudeSessionReader, linkSessions, nodeClaudeFileSystem } from '@core/claude';
import type { OverviewIndex } from '@core/overview';
import type { ClaudeSession, OverviewSettings } from '@shared/types';
import { fail } from './errors';
import { gardenerStateFor } from './gardener-deps';
import { applyExternalTouches } from '../claude-touches';
import type { IndexLike } from '../contracts';
import { recentWorkLabels } from '../messages';
import { overviewState } from '../overview-state';
import type { OverviewState } from '../overview-state';
import type { Services } from '../services';

/** So lange gilt eine gelesene Sitzungsliste als frisch. */
export const SESSION_CACHE_MS = 4000;

/** So viele Sitzungen liest ein Lauf, wenn niemand eine Zahl nennt. */
export const SESSION_LIMIT = 20;

/** Was der Überblick am Index braucht — `IndexService` erfüllt es strukturell. */
const OVERVIEW_INDEX_METHODS: readonly string[] = ['projects', 'todos', 'sources', 'index'];

interface SessionCache {
  root: string;
  at: number;
  limit: number;
  sessions: ClaudeSession[];
}

let cache: SessionCache | null = null;

/** Verwirft den Sitzungspuffer — nach `claude:link` und beim Vaultwechsel. */
export function forgetSessions(): void {
  cache = null;
}

function knowsOverview(index: IndexLike): index is IndexLike & OverviewIndex {
  const record = index as unknown as Record<string, unknown>;
  return OVERVIEW_INDEX_METHODS.every((method) => typeof record[method] === 'function');
}

/**
 * Der Index als Lesesicht des Überblicks. Fehlt eine Ableitung, sagt der Kanal
 * das — eine leere Antwort wäre eine Behauptung über einen Vault, den niemand
 * gelesen hat.
 */
export function overviewIndex(services: Services): IndexLike & OverviewIndex {
  const index = services.requireIndex();
  if (!knowsOverview(index)) throw fail('io', 'der Index liefert keine Überblicks-Ableitungen');
  return index;
}

/** Die Schwellen des offenen Vaults. `undefined` heißt: die Vorgaben des Kerns. */
export function overviewSettings(services: Services): OverviewSettings | undefined {
  return services.settings.vault()?.overview;
}

/** Beschriftungen für „zuletzt gearbeitet" in der Sprache der Oberfläche. */
export function overviewLabels(services: Services): ReturnType<typeof recentWorkLabels> {
  return recentWorkLabels(services.settings.uiLanguage());
}

/** Der Ruhezustand dieses Vaults, aus `.secondbrain/overview.json`. */
export function overviewStateFor(services: Services, today: string): Promise<OverviewState> {
  return overviewState(services.requireVaultRoot(), today);
}

/**
 * Der Pflegewert aus dem letzten Pflegelauf (`.secondbrain/gardener.json`).
 *
 * Solange kein Lauf existiert, ist die Antwort `null` — das Dashboard sagt dann
 * „noch nicht geprüft" statt eine 100 zu behaupten. Gezählt wird genau die Liste,
 * die auch der Pflege-Screen zeigt: ohne die Befunde, die der Nutzer als „passt
 * so" markiert oder per Fix erledigt hat.
 */
export async function gardenerSummary(
  services: Services,
): Promise<{ health: number; findingCount: number } | null> {
  const report = (await gardenerStateFor(services)).present();
  if (report === null || report.healthKnown === false) return null;
  return { health: report.health, findingCount: report.findings.length };
}

/** Liest der Vault die Claude-Sessions mit? */
export function usesClaudeSessions(services: Services): boolean {
  const settings = overviewSettings(services);
  return settings !== undefined && settings.useClaudeSessions;
}

function reader(services: Services): ClaudeSessionReader {
  return new ClaudeSessionReader({
    fs: nodeClaudeFileSystem(),
    projectsDir: overviewSettings(services)?.claudeProjectsDir ?? null,
  });
}

/**
 * Die neuesten Sitzungen, den Vault-Projekten zugeordnet.
 *
 * Ist das Mitlesen abgeschaltet, ist die Antwort leer — der Renderer kennt die
 * Einstellung und sagt es an der Kachel, statt „keine Sitzungen" zu behaupten.
 */
export async function claudeSessions(
  services: Services,
  limit = SESSION_LIMIT,
): Promise<ClaudeSession[]> {
  const root = services.requireVaultRoot();
  if (!usesClaudeSessions(services)) {
    /* Ohne Mitlesen dürfen auch keine Spuren im Index stehen bleiben. */
    if (applyExternalTouches(new Map())) await catchUp(services);
    return [];
  }

  const want = Math.max(1, limit);
  const fresh =
    cache !== null &&
    cache.root === root &&
    cache.limit >= want &&
    Date.now() - cache.at < SESSION_CACHE_MS;
  if (fresh && cache !== null) return cache.sessions.slice(0, want);

  const read = Math.max(want, SESSION_LIMIT);
  const sessions = await reader(services).list({ limit: read });
  const index = overviewIndex(services);
  const linked = linkSessions(sessions, index.projects());

  cache = { root, at: Date.now(), limit: read, sessions: linked.sessions };
  if (applyExternalTouches(linked.touches)) await catchUp(services);
  return linked.sessions.slice(0, want);
}

/**
 * Index nachziehen, damit `lastTouch` und `stale` die Sitzungen kennen. Ohne
 * Ereignis: der Aufrufer fragt gerade selbst und liest danach die frischen
 * Projekte. Schlägt es fehl, bleibt die Antwort gültig — sie kennt dann die
 * Sitzungsspuren noch nicht, und das ist besser als kein Dashboard.
 */
async function catchUp(services: Services): Promise<void> {
  const index = services.index();
  if (!index?.refresh) return;
  try {
    /* Ohne Pfadliste: geändert hat sich keine Datei, sondern die Rechengrundlage. */
    await index.refresh();
    await services.refreshIndexState();
  } catch (error) {
    console.warn('[overview] Index-Nachlauf nach dem Sitzungslauf fehlgeschlagen:', error);
  }
}
