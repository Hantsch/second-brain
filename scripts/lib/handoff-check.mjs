/* Checks the contents of a handoff package (the zip a user gets when the app
   is handed off as a file instead of an installer) and the raw `out/**`
   file tree before electron-builder packages it. Both share the same list
   of forbidden patterns — private files must never end up in the shipped
   package under any circumstances. Pure functions over path lists, no
   filesystem access, no throwing — mirrors scripts/seed/settings-guard.mjs
   in shape. */

/** Patterns that must never show up in a shipped package. `*.key` is a
    suffix pattern, all others are exact segment names — this also matches
    when nested deeply, e.g. `foo/.env` or `sub/dir/settings.json`. */
const FORBIDDEN_PATTERNS = [
  '.env',
  '.secondbrain',
  '.demo-vault',
  '.screenshots',
  'node_modules',
  '*.key',
  'settings.json',
];

/** Splits a path into its segments, independent of the separator used
    (both zip entries and `out/**` listings can show up here). */
function segmentsOf(path) {
  return path.split(/[\\/]+/).filter(Boolean);
}

function matchesPattern(segment, pattern) {
  if (pattern.startsWith('*.')) return segment.endsWith(pattern.slice(1));
  return segment === pattern;
}

/** All forbidden patterns that show up anywhere in `path`. */
function forbiddenPatternsIn(path) {
  const segments = segmentsOf(path);
  const found = [];
  for (const segment of segments) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (matchesPattern(segment, pattern)) found.push(pattern);
    }
  }
  return found;
}

function forbiddenFindings(path) {
  return forbiddenPatternsIn(path).map(
    (pattern) => `${path}: contains forbidden pattern '${pattern}'`,
  );
}

/**
 * Checks the contents of the handoff package: `paths` is the list of files
 * that actually ended up in the zip (relative paths as strings). Exactly
 * two files are expected — the portable exe carrying the given `version`,
 * and `README.txt`. Returns finding strings, an empty array meaning no
 * findings. Does not throw.
 */
export function checkHandoffContents(paths, { version }) {
  const findings = [];
  const expectedExeName = `gaston-${version}-portable.exe`;
  const expectedReadmeName = 'README.txt';
  const exeVersionPattern = /^gaston-(.+)-portable\.exe$/;

  for (const path of paths) {
    findings.push(...forbiddenFindings(path));
  }

  /* An exe with the wrong version is its own finding, not a combination of
     "unexpected" + "missing" — otherwise the same error would be reported
     twice. */
  let sawWrongVersionExe = false;
  for (const path of paths) {
    if (path === expectedExeName || path === expectedReadmeName) continue;
    const versionMatch = exeVersionPattern.exec(path);
    if (versionMatch) {
      sawWrongVersionExe = true;
      findings.push(
        `Wrong version in exe name: '${path}' does not match expected version '${version}'`,
      );
    } else {
      findings.push(`Unexpected file in handoff package: '${path}'`);
    }
  }

  const actual = new Set(paths);
  if (!actual.has(expectedExeName) && !sawWrongVersionExe) {
    findings.push(`Missing file in handoff package: '${expectedExeName}'`);
  }
  if (!actual.has(expectedReadmeName)) {
    findings.push(`Missing file in handoff package: '${expectedReadmeName}'`);
  }

  return findings;
}

/**
 * Sweeps an arbitrary path list (e.g. `out/**` before the electron-builder
 * run) for the same forbidden patterns as `checkHandoffContents` — without
 * expecting the exe/README shape, purely the patterns. Returns finding
 * strings, an empty array meaning no findings. Does not throw.
 */
export function checkBundleContents(paths) {
  const findings = [];
  for (const path of paths) {
    findings.push(...forbiddenFindings(path));
  }
  return findings;
}
