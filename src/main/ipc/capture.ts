/* Erfassen und Einordnen — der Weg eines Gedanken durch die Shell.

   dump → (autoClassify) → classify → apply → undo. Entschieden und geschrieben
   wird im Kern (`@core/capture`); hier steht der Ablauf: wer nach einem
   Schreibvorgang den Index nachzieht, wer den Renderer weckt, und wo ein
   fertiger Vorschlag liegt, bis ihn jemand abholt.

   Zwei Entscheidungen, die man im Code sonst nicht sieht:
   - `classify` schreibt nichts. Ein Zwischenstatus `proposed` in der Datei wäre
     eine zweite Wahrheit — und jeder Schreibvorgang weckt den Watcher, der die
     Oberfläche neu laden lässt, die dann wieder einordnet. Stattdessen liegt der
     Vorschlag im Speicher, gebunden an den Hash des Dumps: ändert der Nutzer die
     Datei, fällt er weg.
   - **Es gibt keine Schwelle für automatisches Ablegen.** Es gab eine
     Einstellung dafür; sie hatte nie einen Leser und ist weg. Automatisch
     ablegen hieße schreiben, ohne dass jemand bestätigt hat (Guardrail 2), und
     ein Toast kann kein Rückgängig für einen Ablagevorgang anbieten. */

import {
  applyProposal,
  classifyDump,
  discardDump,
  keepDump,
  undoFiling,
  writeDump,
} from '@core/capture';
import { dumpFromDoc } from '@core/index';
import type { DumpItem, FilingProposal, Project } from '@shared/types';
import type { HandlerMap } from './registry';
import { defineHandlers, fail } from './registry';
import { captureIndex, captureStore } from './capture-deps';
import { normalize, withAllTargets } from './capture-proposal';
import { createGateway } from '../llm-bridge';
import type { Services } from '../services';
import { hideQuickCapture, showQuickCapture } from '../quick-capture';

/** So viele Vorschläge bleiben im Speicher. Mehr braucht keine Inbox. */
const CACHE_LIMIT = 50;

/** Nach jedem Schreibvorgang: Index nachziehen, dann den Renderer wecken. */
async function settle(services: Services, paths: readonly string[]): Promise<void> {
  const touched = [...new Set(paths)];
  const index = services.index();
  if (index?.refresh) {
    try {
      await index.refresh(touched);
      await services.refreshIndexState();
    } catch (error) {
      /* Der Index ist abgeleitet: sein Nachlauf darf einen gelungenen
         Schreibvorgang nicht nachträglich zum Fehler machen. */
      console.warn('[capture] Index-Nachlauf fehlgeschlagen:', error);
    }
  }
  services.sendEvent('event:vault-changed', { paths: touched, external: false });
}

// ── Vorschläge im Speicher ───────────────────────────────────────────────────

/** Ein Vorschlag, gebunden an den Hash des Dumps, aus dem er entstand. */
interface CachedProposal {
  hash: string;
  proposal: FilingProposal;
}

/**
 * Der Vorschlags-Speicher. Er kostet nichts und spart den zweiten Modellaufruf:
 * `autoClassify` legt hier ab, was die Inbox später abholt.
 */
class ProposalCache {
  private readonly entries = new Map<string, CachedProposal>();
  /* Laufende Einordnungen je Dump. Der Hintergrundlauf und die Inbox fragen oft
     gleichzeitig nach demselben Dump — das darf kein zweiter Modellaufruf sein. */
  private readonly pending = new Map<string, Promise<FilingProposal>>();

  forget(path: string): void {
    this.entries.delete(path);
  }

  /** Vorschlag zu einem Dump — aus dem Speicher, sonst frisch eingeordnet. */
  async resolve(services: Services, path: string): Promise<FilingProposal> {
    const store = captureStore(services);
    const doc = await store.read(path);
    if (doc === null) throw fail('not-found', 'diesen Dump gibt es nicht mehr');
    const cached = this.entries.get(path);
    if (cached?.hash === doc.hash) return cached.proposal;
    const running = this.pending.get(path);
    if (running) return running;

    const index = captureIndex(services);
    const now = new Date();
    const work = classifyDump(
      {
        store,
        index,
        gateway: createGateway(services),
        docLanguage: services.settings.vault()?.languages.documents ?? 'de',
        now,
      },
      path,
    ).then((proposal) => withAllTargets(proposal, index, doc.body, now));

    this.pending.set(path, work);
    try {
      const proposal = await work;
      this.remember(path, doc.hash, proposal);
      return proposal;
    } finally {
      this.pending.delete(path);
    }
  }

  private remember(path: string, hash: string, proposal: FilingProposal): void {
    this.entries.set(path, { hash, proposal });
    if (this.entries.size <= CACHE_LIMIT) return;
    const oldest = this.entries.keys().next();
    if (!oldest.done) this.entries.delete(oldest.value);
  }
}

/** Nach dem Dump im Hintergrund einordnen. Ein Fehlschlag bleibt sichtbar. */
function autoClassify(services: Services, cache: ProposalCache, path: string): void {
  if (services.settings.vault()?.capture.autoClassify !== true) return;
  void cache.resolve(services, path).catch(() => {
    services.sendEvent('event:toast', { kind: 'warn', message: 'toast.classifyFailed' });
  });
}

// ── Inbox ────────────────────────────────────────────────────────────────────

/** Bewusst Liegengebliebenes steht hinten; sonst gilt: neueste zuerst. */
function sortDumps(dumps: readonly DumpItem[]): DumpItem[] {
  const rank = (dump: DumpItem): number =>
    dump.status === 'raw' || dump.status === 'proposed' ? 0 : 1;
  return [...dumps].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.created !== b.created) return a.created < b.created ? 1 : -1;
    return a.path.localeCompare(b.path);
  });
}

/**
 * Die Inbox: was der Index kennt, plus was in `inbox/` liegt und dort noch nicht
 * angekommen ist. Ein gerade geschriebener Dump darf nicht erst auftauchen, wenn
 * der Watcher nachgezogen hat.
 */
async function readInbox(services: Services): Promise<DumpItem[]> {
  const store = captureStore(services);
  const index = services.requireIndex();
  const fromIndex = typeof index.dumps === 'function' ? [...index.dumps()] : [];
  const known = new Set(fromIndex.map((dump) => dump.path));
  const found: DumpItem[] = [...fromIndex];

  for await (const entry of store.walk({ dir: 'inbox', ext: '.md' })) {
    if (known.has(entry.path)) continue;
    const doc = await store.read(entry.path);
    if (doc !== null) found.push(dumpFromDoc(doc));
  }
  return sortDumps(found);
}

/** Die Projekte des Index — leer, wenn er sie nicht ableitet. */
function projectsOf(services: Services): readonly Project[] {
  const index = services.requireIndex();
  return typeof index.projects === 'function' ? index.projects() : [];
}

export function captureHandlers(services: Services): HandlerMap {
  const cache = new ProposalCache();

  return defineHandlers({
    'capture:window': ({ show }) => {
      if (show) showQuickCapture(services);
      else hideQuickCapture();
    },

    /* Der Dump geht sofort auf die Platte. Eingeordnet wird danach, im
       Hintergrund — der Gedanke darf auf kein Modell warten. */
    'capture:dump': async ({ text, origin, tags, scope }) => {
      const dump = await writeDump(captureStore(services), {
        text,
        origin,
        ...(tags === undefined ? {} : { tags }),
        ...(scope === undefined ? {} : { scope }),
      });
      await settle(services, [dump.path]);
      autoClassify(services, cache, dump.path);
      return dump;
    },

    'capture:inbox': () => readInbox(services),

    'capture:classify': ({ path }) => cache.resolve(services, path),

    'capture:apply': async ({ proposal }) => {
      const prepared = normalize(proposal, projectsOf(services));
      const result = await applyProposal(captureStore(services), prepared);
      cache.forget(proposal.dumpPath);
      await settle(services, [...result.written, proposal.dumpPath]);
      return result;
    },

    'capture:keep': async ({ path }) => {
      const { dump, undoToken } = await keepDump(captureStore(services), path);
      await settle(services, [path]);
      return { dump, undoToken };
    },

    'capture:discard': async ({ path }) => {
      const removed = await discardDump(captureStore(services), path);
      cache.forget(path);
      await settle(services, [path]);
      return removed;
    },

    'capture:undo': async ({ undoToken }) => {
      const touched = await undoFiling(captureStore(services), undoToken);
      await settle(services, touched);
    },
  });
}
