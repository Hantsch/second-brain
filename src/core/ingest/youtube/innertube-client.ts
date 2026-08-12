/**
 * Der echte youtubei.js-Client — der Fallback ohne Binary.
 *
 * Bewusst hinter einer Fabrik und einem dynamischen `import`: das Paket wird erst
 * geladen, wenn wirklich ein Video ohne yt-dlp geholt werden soll. Tests reichen
 * stattdessen eine eigene `InnertubeFactory` herein und fassen das Netz nie an.
 */

import { IngestError } from '../types';
import type { InnertubeFactory, InnertubeInfoSource } from '../types';

/**
 * Nur die zwei Dinge, die wir am Modul brauchen. Bewusst eine eigene Beschreibung
 * statt der Paket-Typen: die Objektstruktur von youtubei.js wandert zwischen
 * Major-Versionen, und der Provider liest ohnehin jedes Feld defensiv.
 */
interface InnertubeModule {
  Innertube?: { create(options: Record<string, unknown>): Promise<InnertubeInfoSource> };
  default?: {
    Innertube?: { create(options: Record<string, unknown>): Promise<InnertubeInfoSource> };
  };
  Log?: { setLevel?: (level: unknown) => void; Level?: { NONE?: unknown } };
}

export function innertubeClient(): InnertubeFactory {
  let pending: Promise<InnertubeInfoSource> | null = null;

  return () => {
    if (pending === null) {
      pending = load().catch((error: unknown) => {
        pending = null;
        throw error;
      });
    }
    return pending;
  };
}

async function load(): Promise<InnertubeInfoSource> {
  let mod: InnertubeModule;
  try {
    /* Der Cast ersetzt die Paket-Typen durch die schmale Beschreibung oben — kein
       `any`, nur eine engere Sicht auf ein Modul, das sich oft aendert. */
    mod = (await import('youtubei.js')) as unknown as InnertubeModule;
  } catch (error) {
    throw new IngestError('invalid', 'youtubei.js ist nicht verfuegbar.', { cause: error });
  }

  const factory = mod.Innertube ?? mod.default?.Innertube;
  if (factory === undefined) {
    throw new IngestError('invalid', 'youtubei.js hat keinen Innertube-Export.');
  }

  // youtubei.js schreibt Parser-Warnungen nach stderr, sobald YouTube ein neues
  // Widget ausliefert. Fuer uns Rauschen — Fehler kommen als Ausnahme an.
  if (mod.Log?.setLevel !== undefined && mod.Log.Level?.NONE !== undefined) {
    mod.Log.setLevel(mod.Log.Level.NONE);
  }

  // `retrieve_player: false` spart den Player-Download; Streams brauchen wir nicht.
  return factory.create({ retrieve_player: false, generate_session_locally: true });
}
