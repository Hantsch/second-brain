/* The dashboard module layout, validated.

   It comes from two unvalidated sources: from the renderer via
   `dashboard:setLayout`, and from `settings.json`, which the user is allowed to
   edit directly. Both paths run through here — so a typo in the file doesn't
   result in an empty dashboard, and a made-up module isn't saved.

   Principle: **every module appears exactly once.** Whatever is missing gets
   appended at the end and hidden; anyone who later checks a module in the
   selector finds it there again. Silently losing a module would be the worse
   mistake — there would be no way back. */

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
  /* Module settings are preserved, even if this version doesn't recognize them. */
  const options = source['options'];
  if (typeof options === 'object' && options !== null && !Array.isArray(options)) {
    tile.options = options as Record<string, unknown>;
  }
  return tile;
}

/**
 * A resilient layout built from whatever comes in: known modules in the given
 * order, each once, missing ones appended at the end and hidden.
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
