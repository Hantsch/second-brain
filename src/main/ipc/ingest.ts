/* Quellen aufnehmen: YouTube, URL, Datei, Text → `raw/` → Wiki.

   Die Wahrheit über laufende Aufträge liegt in einer `IngestQueue` des Kerns;
   dieser Bereich hängt sie an den offenen Vault, gibt ihr die Umgebung (fetch,
   Prozessaufruf, Dateisystem, yt-dlp) und schickt jede Änderung als
   `event:ingest-progress` an den Renderer.

   Drei Entscheidungen, die man im Code sonst nicht sieht:
   - **Der Verdichtungsschritt wird hereingegeben.** Der Ingest-Kern kennt
     `core/wiki` nicht; hier kommen beide zusammen. Fehlt ein Modell, endet der
     Auftrag ehrlich als `awaiting-llm` — die Rohquelle liegt trotzdem.
   - **Ohne Zielmodul wird nicht verdichtet.** „Später einordnen" heißt: die
     Rohquelle liegt in `raw/`, es entsteht keine Wiki-Seite und der Auftrag
     trägt keine berührten Seiten. Der Pflegelauf findet sie später als
     unverdichtete Quelle.
   - **yt-dlp wird nie von selbst geholt.** `ytdlpStatus` fragt nur; geladen wird
     ausschließlich über `ytdlpInstall`, also auf Klick. */

import { join } from 'node:path';
import { dialog } from 'electron';
import {
  IngestQueue,
  TERMINAL_STAGES,
  allIngestors,
  innertubeClient,
  installYtdlp,
  logPathFor,
  nodeFileSystem,
  nodeProcessRunner,
  resolveYtdlp,
} from '@core/ingest';
import type { CondenseResult, IngestContext, YtdlpStatus } from '@core/ingest';
import { ingestSource } from '@core/wiki';
import type { IngestJob } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { docLanguage, settle, wikiDeps, wikiStore } from './wiki-bridge';
import { createGateway } from '../llm-bridge';
import type { Services } from '../services';

/** So viele Aufträge laufen gleichzeitig. */
const CONCURRENCY = 2;

/* Der zuletzt gefundene yt-dlp-Pfad. Ein `resolveYtdlp` je Auftrag würde einen
   Prozess starten, bevor überhaupt etwas geholt wird; gefragt wird deshalb beim
   Statusabruf und beim Installieren — und das Ergebnis bleibt hier liegen. */
const ytdlpCache: { path: string | null } = { path: null };

/* Der Ersatzweg ohne Binary. Einmal gebaut: der Client lädt sein Modul beim
   ersten Gebrauch und behält die Sitzung. */
const innertube = innertubeClient();

/** Die verwaltete yt-dlp-Kopie liegt neben den Einstellungen, nicht im Vault. */
function binDir(services: Services): string {
  return join(services.userDataDir, 'bin');
}

function ytdlpDeps(services: Services) {
  return {
    fs: nodeFileSystem(),
    run: nodeProcessRunner(),
    platform: process.platform,
    binDir: binDir(services),
  };
}

/** Der Zustand, wie der Renderer ihn braucht — ohne Innereien der Auflösung. */
function ytdlpView(status: YtdlpStatus): {
  available: boolean;
  path: string | null;
  version: string | null;
} {
  return { available: status.available, path: status.path, version: status.version };
}

/**
 * Umgebung eines Auftrags: alles, was Netz, Prozesse und Dateien außerhalb des
 * Vaults anfasst. Pro Auftrag frisch gelesen — der Nutzer darf yt-dlp
 * einrichten, während schon ein Auftrag läuft.
 *
 * Die Untertitelsprachen leiten sich aus der Dokumentsprache ab: Original
 * zuerst, dann die Sprache, in der die Seiten geschrieben werden, dann Englisch.
 * Ein eigener `ingest`-Abschnitt in den Vault-Einstellungen gibt es noch nicht.
 */
function environment(
  services: Services,
): Omit<IngestContext, 'store' | 'onProgress' | 'signal' | 'module'> {
  return {
    fetchImpl: fetch,
    fs: nodeFileSystem(),
    run: nodeProcessRunner(),
    languages: ['original', docLanguage(services), 'en'],
    youtube: {
      ytdlpPath: ytdlpCache.path,
      innertube,
    },
  };
}

/**
 * Die Warteschlange des offenen Vaults. Wechselt der Vault, wird die alte
 * abgebrochen: ein Auftrag, der in einen geschlossenen Vault schreibt, wäre ein
 * Schreibvorgang ohne Zuhause.
 */
class QueueHolder {
  private root: string | null = null;
  private queue: IngestQueue | null = null;

  constructor(private readonly services: Services) {}

  current(): IngestQueue {
    const root = this.services.requireVaultRoot();
    if (this.queue !== null && this.root === root) return this.queue;
    this.queue?.cancelAll();
    this.root = root;
    this.queue = this.build();
    return this.queue;
  }

  private build(): IngestQueue {
    const services = this.services;
    return new IngestQueue({
      store: wikiStore(services),
      ingestors: allIngestors(),
      environment: () => environment(services),
      llmAvailable: () => createGateway(services).isAvailable('summarize-source'),
      concurrency: () => CONCURRENCY,
      condense: ({ job, outcome, signal }) => this.condense(job, outcome, signal),
      onUpdate: (job) => this.publish(job),
    });
  }

  /** Rohquelle → Source-Seite, Entitäten, Konzepte, Katalog, Chronik. */
  private async condense(
    job: IngestJob,
    outcome: { rawPath: string; title: string; text: string; origin: string },
    signal: AbortSignal | undefined,
  ): Promise<CondenseResult> {
    const module = job.module;
    /* „Später einordnen": nichts erfinden. Die Rohquelle liegt, der Katalog
       bleibt unberührt, und die Quelle taucht als unverdichtet in der Liste auf. */
    if (module === null || module.length === 0) return { pages: [] };

    const result = await ingestSource(wikiDeps(this.services, signal), {
      rawPath: outcome.rawPath,
      module,
      title: outcome.title,
      text: outcome.text,
      origin: outcome.origin,
    });
    return {
      pages: result.touchedPages,
      sourcePage: result.sourceSlug,
      modules: [result.module],
    };
  }

  /** Jede Änderung an den Renderer; am Ende zieht der Index nach. */
  private publish(job: IngestJob): void {
    this.services.sendEvent('event:ingest-progress', job);
    /* Auch ein abgebrochener Lauf kann eine Rohquelle hinterlassen haben — der
       Index soll sie kennen, statt sie bis zum nächsten Start zu übersehen. */
    if (!TERMINAL_STAGES.has(job.stage)) return;
    /* Das Protokoll gehört dazu: der Index entscheidet an der Dateiendung, ob ihn
       ein Pfad betrifft — und eine Rohquelle ist oft ein Ordner ohne Endung. */
    const raw = job.rawPath === null ? [] : [job.rawPath, logPathFor(job.rawPath)];
    void settle(this.services, [...raw, ...job.touchedPages], 'ingest').catch(() => undefined);
  }
}

export function ingestHandlers(services: Services): HandlerMap {
  const holder = new QueueHolder(services);

  return defineHandlers({
    'ingest:pickFiles': async () => {
      const parent = services.mainWindow();
      const options = { properties: ['openFile', 'multiSelections'] as const };
      const result = await (parent
        ? dialog.showOpenDialog(parent, { properties: [...options.properties] })
        : dialog.showOpenDialog({ properties: [...options.properties] }));
      return result.canceled ? [] : result.filePaths;
    },

    'ingest:start': ({ kind, input, module }) => {
      const text = String(input ?? '').trim();
      if (text.length === 0) throw fail('invalid', 'ohne Eingabe gibt es keine Quelle');
      return holder.current().add({ kind, input, module: module ?? null });
    },

    'ingest:jobs': () => holder.current().jobs(),

    'ingest:cancel': ({ id }) => {
      holder.current().cancel(id);
    },

    'ingest:retry': ({ id }) => holder.current().retry(id),

    /* Fragt nur: den in den Einstellungen genannten Pfad gibt es noch nicht
       (`VaultSettings` hat keinen `ingest`-Abschnitt), also zählen PATH und die
       verwaltete Kopie. */
    'ingest:ytdlpStatus': async () => {
      const status = await resolveYtdlp({ ...ytdlpDeps(services), configuredPath: null });
      ytdlpCache.path = status.path;
      return ytdlpView(status);
    },

    /* Nur auf Klick: ein Download, den niemand angestoßen hat, wäre ein
       Netzzugriff hinter dem Rücken des Nutzers. */
    'ingest:ytdlpInstall': async () => {
      const status = await installYtdlp({ ...ytdlpDeps(services), fetchImpl: fetch });
      ytdlpCache.path = status.path;
      return ytdlpView(status);
    },
  });
}
