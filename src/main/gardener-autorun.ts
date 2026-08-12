/* Der Pflegelauf beim Öffnen des Vaults — die Einstellung `gardener.runOnOpen`.

   Der Schalter im Verhalten-Tab liest jetzt jemand, deshalb ist er scharf. Vier
   Regeln, damit er nicht zur Last wird:

   - **Nur wenn er an ist.** Sonst passiert nichts, und der Schalter sagt die
     Wahrheit.
   - **Erst wenn der Index steht.** Beim Öffnen baut er noch; ein Lauf über einen
     halben Index fände Befunde, die es nicht gibt. Also warten und erneut
     versuchen — genauso wie die Benachrichtigung der Erinnerungen.
   - **Ein Lauf je Öffnen.** Nicht auf Vorrat, nicht im Takt: wer öfter prüfen
     will, klickt im Screen „Jetzt prüfen".
   - **Die Deutung entscheidet die Einstellung**, nicht dieser Automat: ohne
     `gardener.useLlm` bleibt der Lauf deterministisch und kostet nichts.

   Ein Vaultwechsel wird an `app.lastVault` erkannt — dieselbe Mechanik wie in
   `reminder-notify.ts`, damit der Service-Container keinen zweiten Haken braucht.
   Fehler bleiben leise: ein ausgefallener Pflegelauf darf die App nicht kosten. */

import { runWithProgress } from './ipc/gardener-deps';
import { gardenerStateFor } from './ipc/gardener-deps';
import { GARDENER_STATE_FILE } from './gardener-state';
import type { Services } from './services';

/**
 * So lange nach dem Öffnen wird geprüft — der Index braucht kurz. Kein langes
 * Warten nötig: steht er noch nicht, wird derselbe Abstand später erneut
 * versucht, und der Lauf selbst kostet Millisekunden (er rechnet nur über den
 * Index). Mit Deutung kostet er ein Modell — deshalb entscheidet `useLlm` in den
 * Einstellungen, nicht dieser Automat.
 */
export const FIRST_RUN_DELAY_MS = 2500;

/** So oft wird auf den Index gewartet, bevor der Lauf ausfällt. */
const INDEX_RETRIES = 8;

/** Was ein Anlauf getan hat — der Test liest daran ab, dass nichts erfunden wurde. */
export type AutorunResult = 'ran' | 'off' | 'no-index' | 'busy';

export interface AutorunOptions {
  /** Verzögerung bis zum ersten Versuch. Tests setzen sie auf 0. */
  delayMs?: number;
}

export class GardenerAutorun {
  private first: ReturnType<typeof setTimeout> | null = null;
  private unwatch: (() => void) | null = null;
  private lastVault: string | null = null;
  private busy = false;

  constructor(
    private readonly services: Services,
    private readonly options: AutorunOptions = {},
  ) {}

  start(): void {
    this.lastVault = this.services.settings.app().lastVault;
    this.unwatch = this.services.settings.onChange((snapshot) => {
      if (snapshot.app.lastVault === this.lastVault) return;
      this.lastVault = snapshot.app.lastVault;
      if (snapshot.app.lastVault !== null) this.schedule();
    });
    this.schedule();
  }

  stop(): void {
    if (this.first !== null) clearTimeout(this.first);
    this.first = null;
    this.unwatch?.();
    this.unwatch = null;
  }

  private schedule(): void {
    if (this.first !== null) clearTimeout(this.first);
    this.first = setTimeout(() => {
      this.first = null;
      void this.runWhenReady();
    }, this.options.delayMs ?? FIRST_RUN_DELAY_MS);
  }

  /** Wartet, bis der Index steht. Danach höchstens ein Lauf. */
  async runWhenReady(attempt = 0): Promise<AutorunResult> {
    const result = await this.run();
    if (result !== 'no-index' || attempt >= INDEX_RETRIES) return result;
    return new Promise((resolve) => {
      setTimeout(
        () => void this.runWhenReady(attempt + 1).then(resolve),
        this.options.delayMs ?? FIRST_RUN_DELAY_MS,
      );
    });
  }

  /** Ein Anlauf. Meldet, was er getan hat. */
  async run(): Promise<AutorunResult> {
    if (this.busy) return 'busy';
    const settings = this.services.settings.vault();
    if (settings === null || !settings.gardener.runOnOpen) return 'off';
    const status = this.services.status();
    if (!status.ready || status.indexing || this.services.index() === null) return 'no-index';

    this.busy = true;
    try {
      const state = await gardenerStateFor(this.services);
      const run = await runWithProgress(this.services);
      await state.save(run);
      /* Dieselbe Weckung wie im Kanal: der Bericht liegt jetzt anders. */
      this.services.sendEvent('event:vault-changed', {
        paths: [GARDENER_STATE_FILE],
        external: false,
      });
      return 'ran';
    } catch (error) {
      console.warn('[gardener] Pflegelauf beim Öffnen fehlgeschlagen:', error);
      return 'no-index';
    } finally {
      this.busy = false;
    }
  }
}

/** Baut den Automaten und startet ihn. Rückgabe hält ihn wieder an. */
export function startGardenerAutorun(
  services: Services,
  options: AutorunOptions = {},
): GardenerAutorun {
  const autorun = new GardenerAutorun(services, options);
  autorun.start();
  return autorun;
}
