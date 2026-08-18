/**
 * Oeffentliche Oberflaeche des Index. Andere Module importieren von hier, nicht aus
 * den Einzeldateien — so bleibt der Umbau innen moeglich.
 *
 * Der Index ist abgeleitet: `.secondbrain/index/` darf jederzeit verschwinden.
 * Wer ihn braucht, nimmt `IndexService.open(store)`.
 */

export * from './types';
export * from './dates';
export * from './text';
export * from './todos';
export * from './projects';
export * from './areas';
export * from './dumps';
export * from './journal';
export * from './modules';
export * from './pages';
export * from './snippet';
export * from './search';
export * from './build';
export * from './persist';
export * from './stats';
export * from './service';
