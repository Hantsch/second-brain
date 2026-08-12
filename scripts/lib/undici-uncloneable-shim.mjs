/* Notnagel für Node < 22.10.
 *
 * jsdom@30 zieht undici@8 herein, und undici holt sich beim Laden
 * `markAsUncloneable` aus `node:worker_threads`. Die Funktion gibt es erst ab
 * Node 22.10; auf Node 20 stirbt schon der Vitest-Worker beim Anlegen der
 * jsdom-Umgebung ("webidl.util.markAsUncloneable is not a function") — also
 * bevor irgendein Test oder ein Setup laufen kann.
 *
 * Deshalb per `--import` vorab geladen: undici destrukturiert die Funktion beim
 * Laden, sie muss vorher am Modulobjekt hängen. `node:worker_threads` ist ein
 * eingebautes CJS-Modul, sein Standard-Export ist deshalb veränderbar.
 *
 * Die echte Funktion markiert Objekte als nicht klonbar für `structuredClone`;
 * in Tests hat das keine Wirkung, ein leerer Rumpf genügt.
 *
 * Sobald das Projekt Node 22 verlangt, kann diese Datei weg.
 */

import worker from 'node:worker_threads';

if (typeof worker.markAsUncloneable !== 'function') {
  worker.markAsUncloneable = function markAsUncloneable() {};
}
