/* Die Anordnung der Dashboard-Module, geprüft.

   Sie kommt aus zwei ungeprüften Quellen: vom Renderer über `dashboard:setLayout`
   und aus `settings.json`, die der Nutzer selbst editieren darf. Beide Wege
   laufen hier durch — damit ein Tippfehler in der Datei kein leeres Dashboard
   ergibt und ein erfundener Baustein nicht gespeichert wird.

   Grundsatz: **jedes Modul kommt genau einmal vor.** Was fehlt, wird hinten
   angehängt und ausgeblendet; wer ein Modul später in der Auswahl anhakt, findet
   es dort wieder. Ein Modul stillschweigend zu verlieren wäre der schlimmere
   Fehler — es gäbe dann keinen Weg zurück. */

import { DASHBOARD_MODULES, MODULE_SIZES } from '@shared/types';
import type { DashboardLayout, DashboardModuleId, DashboardTile, ModuleSize } from '@shared/types';

const KNOWN = new Set<string>(DASHBOARD_MODULES);
const SIZES = new Set<string>(MODULE_SIZES);

function isModuleId(value: unknown): value is DashboardModuleId {
  return typeof value === 'string' && KNOWN.has(value);
}

function readSize(value: unknown): ModuleSize {
  return typeof value === 'string' && SIZES.has(value) ? (value as ModuleSize) : 'md';
}

function readTile(value: unknown): DashboardTile | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  if (!isModuleId(source['id'])) return null;
  const tile: DashboardTile = { id: source['id'], size: readSize(source['size']) };
  if (source['hidden'] === true) tile.hidden = true;
  /* Modul-Einstellungen bleiben erhalten, auch wenn diese Fassung sie nicht kennt. */
  const options = source['options'];
  if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
    tile.options = options as Record<string, unknown>;
  }
  return tile;
}

/**
 * Eine belastbare Anordnung aus allem, was hereinkommt: bekannte Module in der
 * gegebenen Reihenfolge, jedes einmal, fehlende hinten und ausgeblendet.
 */
export function normalizeLayout(input: unknown, now: string): DashboardLayout {
  const source =
    typeof input === 'object' && input !== null ? (input as { tiles?: unknown }) : null;
  const raw = Array.isArray(source?.tiles) ? (source.tiles as unknown[]) : [];
  const tiles: DashboardTile[] = [];
  const seen = new Set<DashboardModuleId>();

  for (const entry of raw) {
    const tile = readTile(entry);
    if (tile === null || seen.has(tile.id)) continue;
    seen.add(tile.id);
    tiles.push(tile);
  }
  for (const id of DASHBOARD_MODULES) {
    if (seen.has(id)) continue;
    tiles.push({ id, size: 'md', hidden: true });
  }
  return { tiles, updated: now };
}
