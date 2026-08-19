/**
 * sha256 ueber Dateiinhalte. Der Hash ist das einzige Mittel, mit dem die App
 * externe Aenderungen erkennt — deshalb immer ueber den *vollen* Inhalt.
 *
 * `node:crypto` ist erlaubt: kein natives Modul, in Node und im Electron-Main
 * vorhanden, und rein rechnend (kein Dateisystem, kein Netz).
 */

import { createHash } from 'node:crypto';

/** sha256 als Hex-String ueber die UTF-8-Kodierung des Textes. */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Groesse in Byte, die der Text als UTF-8 auf der Platte belegt. */
export function byteLength(content: string): number {
  return new TextEncoder().encode(content).length;
}
