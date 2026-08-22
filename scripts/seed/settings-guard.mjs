/* Wächter gegen nach außen zeigende Einstellungen im Demo-Vault. Der Vault
   muss portabel bleiben (siehe CLAUDE.md): zeigt `settings.json` auf einen
   Ordner außerhalb des Vaults — oder auf einen, der gar nicht existiert oder
   leer ist — liest die App beim nächsten Start echte Daten (z. B. das echte
   `~/.claude/projects`) statt der Demo-Ablage. Reine Funktion über das
   geschriebene `settings.json`-Objekt, kein Werfen — mirrors check.mjs. */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Windows-Laufwerkspfad (`C:\...`, `C:/...`), POSIX-Absolutpfad (`/...`)
    oder Home-Pfad (`~...`). Bewusst einfach gehalten, kein Anspruch auf
    Vollständigkeit — eine grobe Heuristik reicht für den Zweck hier. */
const ABSOLUTE_PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|\/|~)/;

/** Normalisiert für den Präfix-Vergleich: aufgelöst und mit '/' statt '\'. */
function normalize(path) {
  return resolve(path).replace(/\\/g, '/');
}

function isInsideVault(path, vaultRoot) {
  const normalizedPath = normalize(path).toLowerCase();
  const normalizedRoot = normalize(vaultRoot).toLowerCase();
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

/** Enthält `dir` (rekursiv) mindestens eine Datei? */
function containsAnyFile(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (containsAnyFile(absolute)) return true;
    } else {
      return true;
    }
  }
  return false;
}

/** Prüft eine der beiden Pflicht-Verlaufsablagen (`claudeProjectsDir`,
    `codexSessionsDir`): fehlt, existiert nicht, ist leer, oder liegt
    außerhalb des Vaults. */
function checkSessionDir(label, dir, vaultRoot, problems) {
  if (typeof dir !== 'string' || dir.trim() === '') {
    problems.push(`${label}: kein Pfad gesetzt`);
    return;
  }
  if (!existsSync(dir)) {
    problems.push(`${label}: Pfad existiert nicht (${dir})`);
    return;
  }
  if (!statSync(dir).isDirectory()) {
    problems.push(`${label}: Pfad ist kein Ordner (${dir})`);
    return;
  }
  if (!containsAnyFile(dir)) {
    problems.push(`${label}: Ordner ist leer (${dir})`);
  }
  if (!isInsideVault(dir, vaultRoot)) {
    problems.push(`${label}: Pfad liegt außerhalb des Vaults (${dir})`);
  }
}

/** Läuft rekursiv durch alle String-Werte in Objekten/Arrays und meldet
    jeden Wert, der wie ein Absolutpfad aussieht und außerhalb des Vaults
    liegt. `skip` nimmt Werte, die schon ihre eigene, spezifischere Prüfung
    hatten (die beiden Session-Ordner oben) — sonst gäbe es Doppelmeldungen. */
function sweepForOutwardPaths(value, vaultRoot, path, skip, problems) {
  if (typeof value === 'string') {
    if (skip.has(value)) return;
    if (ABSOLUTE_PATH_PATTERN.test(value) && !isInsideVault(value, vaultRoot)) {
      problems.push(`${path}: Pfad liegt außerhalb des Vaults (${value})`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => sweepForOutwardPaths(item, vaultRoot, `${path}[${index}]`, skip, problems));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      sweepForOutwardPaths(nested, vaultRoot, path ? `${path}.${key}` : key, skip, problems);
    }
  }
}

/**
 * Prüft das geschriebene `settings.json`-Objekt gegen nach außen zeigende
 * Pfade. `vaultRoot` ist der absolute Vault-Ordner (`options.out`).
 *
 * Gibt Problem-Strings zurück, leeres Array = keine Befunde. Wirft nicht.
 */
export function checkSettingsGuard(settings, vaultRoot) {
  const problems = [];
  const overview = settings?.overview ?? {};

  checkSessionDir('overview.claudeProjectsDir', overview.claudeProjectsDir, vaultRoot, problems);
  checkSessionDir('overview.codexSessionsDir', overview.codexSessionsDir, vaultRoot, problems);

  const skip = new Set(
    [overview.claudeProjectsDir, overview.codexSessionsDir].filter(
      (value) => typeof value === 'string',
    ),
  );
  sweepForOutwardPaths(settings, vaultRoot, '', skip, problems);

  return problems;
}
