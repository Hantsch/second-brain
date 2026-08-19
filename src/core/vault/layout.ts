/**
 * Vault-Struktur anlegen und pruefen.
 *
 * Ein Ordner ist genau dann ein Vault, wenn `.secondbrain/vault.json` existiert.
 * `ensureStructure` ist idempotent: ein zweiter Aufruf legt nichts neu an und
 * ueberschreibt nichts — schon vorhandene Marker und READMEs bleiben, wie sie sind.
 */

import { SCOPES, VAULT_DIRS } from '@shared/types';
import { FsVaultStore } from './fs-store';
import { baseName, markerPath, toVaultPath } from './paths';
import type { VaultStore } from './types';

/** Format-Version des Vaults. Wird erhoeht, wenn eine Migration noetig wird. */
export const VAULT_VERSION = 1;

/** Inhalt von `.secondbrain/vault.json`. */
export interface VaultMarker {
  version: number;
  name: string;
  createdAt: string;
}

export interface VaultLayoutResult {
  root: string;
  name: string;
  marker: VaultMarker;
  /** Der Vault wurde mit diesem Aufruf zum Vault gemacht. */
  createdMarker: boolean;
  createdReadme: boolean;
  /** Ordner, die dieser Aufruf tatsaechlich angelegt hat. */
  createdDirs: string[];
}

/** Store oder Wurzelpfad — beides darf man uebergeben. */
export type VaultTarget = string | VaultStore;

const README_PATH = 'README.md';

/** Alle Ordner aus VAULT-FORMAT.md, in der Reihenfolge des Dokuments. */
export function structureDirs(): string[] {
  return [
    VAULT_DIRS.inbox,
    VAULT_DIRS.journal,
    VAULT_DIRS.projects,
    ...SCOPES.map((scope) => `${VAULT_DIRS.projects}/${scope}`),
    VAULT_DIRS.areas,
    VAULT_DIRS.modules,
    VAULT_DIRS.raw,
    `${VAULT_DIRS.raw}/youtube`,
    `${VAULT_DIRS.raw}/files`,
    `${VAULT_DIRS.raw}/web`,
    VAULT_DIRS.internal,
    `${VAULT_DIRS.internal}/index`,
    `${VAULT_DIRS.internal}/chats`,
    `${VAULT_DIRS.internal}/logs`,
    `${VAULT_DIRS.internal}/trash`,
  ];
}

function toStore(target: VaultTarget): VaultStore {
  return typeof target === 'string' ? new FsVaultStore(target) : target;
}

/** Letztes Pfadsegment als Vault-Name: 'C:/notizen/zweites-hirn' → 'zweites-hirn'. */
export function vaultNameFromRoot(root: string): string {
  const name = baseName(toVaultPath(root));
  return name.length > 0 ? name : 'vault';
}

/** `.secondbrain/vault.json` lesen; `null`, wenn es fehlt oder unbrauchbar ist. */
export async function readVaultMarker(target: VaultTarget): Promise<VaultMarker | null> {
  const store = toStore(target);
  const raw = await store.readText(markerPath());
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<VaultMarker> & { created?: unknown };
    // `created` ist die Feldbezeichnung des vorlaeufigen Shell-Markers: aeltere
    // Vaults sollen sich ohne Migration weiter oeffnen lassen.
    const createdAt =
      typeof candidate.createdAt === 'string'
        ? candidate.createdAt
        : typeof candidate.created === 'string'
          ? candidate.created
          : '';
    return {
      version: typeof candidate.version === 'number' ? candidate.version : VAULT_VERSION,
      name: typeof candidate.name === 'string' ? candidate.name : vaultNameFromRoot(store.root),
      createdAt,
    };
  } catch {
    return null;
  }
}

/** Ist das ein Vault? Genau eine Bedingung: der Marker existiert und ist lesbar. */
export async function isVault(target: VaultTarget): Promise<boolean> {
  return (await readVaultMarker(target)) !== null;
}

/**
 * Legt die Ordnerstruktur, den Marker und eine README an. Vorhandenes bleibt
 * unangetastet, damit ein Aufruf beim Oeffnen eines gewachsenen Vaults gefahrlos ist.
 */
export async function ensureStructure(
  target: VaultTarget,
  options: { name?: string; now?: Date } = {},
): Promise<VaultLayoutResult> {
  const store = toStore(target);
  const createdDirs: string[] = [];
  for (const dir of structureDirs()) {
    if (await store.exists(dir)) continue;
    await store.mkdir(dir);
    createdDirs.push(dir);
  }

  const existing = await readVaultMarker(store);
  const name = options.name ?? existing?.name ?? vaultNameFromRoot(store.root);
  const marker: VaultMarker = existing ?? {
    version: VAULT_VERSION,
    name,
    createdAt: (options.now ?? new Date()).toISOString(),
  };
  const createdMarker = existing === null;
  if (createdMarker) {
    await store.writeText(markerPath(), `${JSON.stringify(marker, null, 2)}\n`);
  }

  const createdReadme = !(await store.exists(README_PATH));
  if (createdReadme) {
    await store.writeText(README_PATH, readmeText(marker.name));
  }

  return { root: store.root, name: marker.name, marker, createdMarker, createdReadme, createdDirs };
}

/** Erklaert dem Menschen, was in diesem Ordner liegt. Bewusst kurz. */
function readmeText(name: string): string {
  return `# ${name}

Dieser Ordner ist ein Second-Brain-Vault. Alles darin sind Markdown-Dateien mit
YAML-Frontmatter: lesbar in Obsidian, VS Code oder Notepad, versionierbar mit Git,
kopierbar auf einen USB-Stick. Die Dateien sind die Wahrheit — die App leitet alles
andere daraus ab.

## Was wo liegt

- \`inbox/\` — hineingeworfene Gedanken, noch nicht eingeordnet.
- \`journal/JJJJ/MM/JJJJ-MM-TT.md\` — ein Tag, eine Datei.
- \`projects/work|private/<projekt>/project.md\` — Stand, naechster Schritt, Todos.
- \`areas/\` — laufende Verantwortungen ohne Ende.
- \`modules/<modul>/wiki/\` — Wissens-Module: Quellen, Entitaeten, Begriffe.
- \`raw/\` — aufgenommene Quellen. Unveraenderlich: hier wird nie etwas ueberschrieben.
- \`.secondbrain/\` — Suchindex, Einstellungen, Papierkorb, Logs. Alles daraus ist
  ableitbar und darf geloescht werden; verloren geht dabei nichts.

## Direkt bearbeiten ist erlaubt

Aenderungen von aussen werden erkannt und neu eingelesen. Die App schreibt nur, wenn
der Dateizustand noch der ist, den sie gelesen hat — sonst meldet sie einen Konflikt
statt zu ueberschreiben. Unbekannte Frontmatter-Felder bleiben erhalten.

Geloeschtes liegt eine Weile unter \`.secondbrain/trash/\` und kann zurueckgeholt werden.
`;
}
