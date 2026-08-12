/**
 * Der Ordnername unter `~/.claude/projects` und das Arbeitsverzeichnis dahinter.
 *
 * Claude Code kodiert das Arbeitsverzeichnis, indem es Trenner, Doppelpunkt und
 * Punkt durch `-` ersetzt (gemessen in `../claude-control/docs/RESEARCH.md` §2:
 * `c:\development\Hantsch\second-brain` → `c--development-Hantsch-second-brain`).
 *
 * **Diese Kodierung ist verlustbehaftet.** Aus dem Ordnernamen allein ist nicht zu
 * erkennen, ob ein `-` ein Trenner war oder im Ordnernamen stand: aus
 * `...-second-brain` wird sonst `.../second/brain`. Deshalb ist der Ordnername nur
 * der Einstieg. Die Wahrheit steht im Feld `cwd` der JSONL-Records — es wird
 * mitgelesen und schlaegt jede Ruecktransformation. Erst wenn kein Record ein `cwd`
 * traegt, werden Kandidaten gebildet und gegen die Platte geprueft; bleibt auch das
 * ohne Treffer, ist das Ergebnis ausdruecklich unbestaetigt (`verified: false`).
 */

/** Zeichen, die Claude Code auf `-` abbildet (RESEARCH.md §2). */
const ENCODED = /[\\/:.]/g;

/** So viele Ruecktransformationen werden hoechstens geprueft. */
const MAX_CANDIDATES = 64;

/** Ordnername, den Claude Code fuer ein Arbeitsverzeichnis anlegt. */
export function slugForPath(path: string): string {
  return path.replace(ENCODED, '-');
}

/**
 * Anzeigeform eines Pfades: Schraegstriche, kleingeschriebener Laufwerksbuchstabe,
 * kein Schlusstrenner. Die uebrige Schreibweise bleibt, wie sie ist — der Nutzer
 * soll seinen Pfad wiedererkennen.
 */
export function normalizePath(path: string): string {
  const unified = path.replace(/[\\/]+/g, '/').replace(/(.)\/+$/, '$1');
  return /^[a-zA-Z]:/.test(unified) ? unified[0]!.toLowerCase() + unified.slice(1) : unified;
}

/** Vergleichsform eines Pfades: wie `normalizePath`, zusaetzlich kleingeschrieben. */
export function pathKey(path: string): string {
  return normalizePath(path).toLowerCase();
}

/**
 * Schreibform eines Pfades fuer eine Vault-Datei: Schraegstriche,
 * **grosser** Laufwerksbuchstabe, kein Schlusstrenner.
 *
 * Die Anzeigeform (`normalizePath`) schreibt den Laufwerksbuchstaben klein.
 * Landete sie so in `repos`, stuende derselbe Ordner in zwei Schreibweisen in der
 * Datei — `['C:/development/x', c:/development/y]` — und jeder literale Vergleich
 * ausserhalb dieses Moduls (Git-Diff, Obsidian, ein Skript des Nutzers) hielte sie
 * fuer verschieden. Geschrieben wird deshalb die Form aus docs/VAULT-FORMAT.md.
 */
export function vaultPath(path: string): string {
  const unified = normalizePath(path);
  return /^[a-z]:/.test(unified) ? unified[0]!.toUpperCase() + unified.slice(1) : unified;
}

/** Ist `child` derselbe Pfad wie `parent` oder liegt er darunter? */
export function isPathInside(child: string, parent: string): boolean {
  const c = pathKey(child);
  const p = pathKey(parent);
  return c === p || c.startsWith(p.endsWith('/') ? p : `${p}/`);
}

/** Letztes Pfadstueck — der kurze Projektname. */
export function projectNameOf(path: string): string {
  const parts = normalizePath(path)
    .split('/')
    .filter((part) => part.length > 0);
  const last = parts[parts.length - 1];
  return last === undefined ? path : last.replace(/:$/, '');
}

/** Traegt dieses Arbeitsverzeichnis genau diesen Ordnernamen? Gross/klein zaehlt nicht. */
export function slugMatchesDir(cwd: string, dirName: string): boolean {
  return slugForPath(cwd).toLowerCase() === dirName.toLowerCase();
}

/**
 * Segmente eines Ordnernamens. Zwei `-` hintereinander entstehen dort, wo ein
 * Punkt direkt hinter einem Trenner stand (`/home/x/.config` → `-home-x--config`);
 * das leere Segment wird deshalb als Punkt an das folgende gehaengt.
 */
function segmentsOf(rest: string): string[] {
  const tokens = rest.split('-');
  const segments: string[] = [];
  let dotted = false;
  for (const token of tokens) {
    if (token.length === 0) {
      dotted = true;
      continue;
    }
    segments.push(dotted ? `.${token}` : token);
    dotted = false;
  }
  return segments;
}

interface Decoded {
  /** Wurzel: `c:/`, `/` oder leer. */
  prefix: string;
  segments: string[];
}

function decode(dirName: string): Decoded {
  const drive = /^([a-zA-Z])--(.*)$/.exec(dirName);
  if (drive) {
    return { prefix: `${drive[1]!.toLowerCase()}:/`, segments: segmentsOf(drive[2] ?? '') };
  }
  if (dirName.startsWith('-')) return { prefix: '/', segments: segmentsOf(dirName.slice(1)) };
  return { prefix: '', segments: segmentsOf(dirName) };
}

/** Segmente zu einem Pfad, wobei `[from, to)` mit Bindestrichen zusammengezogen wird. */
function assemble(decoded: Decoded, from: number, to: number): string {
  const parts: string[] = [];
  for (let index = 0; index < decoded.segments.length; index += 1) {
    if (index === from && to > from) {
      parts.push(decoded.segments.slice(from, to).join('-'));
      index = to - 1;
      continue;
    }
    parts.push(decoded.segments[index]!);
  }
  return decoded.prefix + parts.join('/');
}

/**
 * Moegliche Arbeitsverzeichnisse zu einem Ordnernamen, plausibelste zuerst.
 *
 * Geraten wird hoechstens **eine** zusammenhaengende Bindestrich-Gruppe — Gruppen
 * am Ende zuerst, weil dort die kebab-case-Repos liegen. Mehr zu raten hiesse,
 * exponentiell viele Pfade zu erfinden; dafuer ist das `cwd` aus den Records da.
 */
export function pathCandidates(dirName: string): string[] {
  const decoded = decode(dirName);
  const count = decoded.segments.length;
  if (count === 0) return [dirName];

  const candidates: string[] = [assemble(decoded, 0, 0)];
  const runs: [number, number][] = [];
  for (let length = 2; length <= count; length += 1) {
    for (let from = count - length; from >= 0; from -= 1) runs.push([from, from + length]);
  }
  // Gruppen am Ende und kurze Gruppen zuerst.
  runs.sort((a, b) => b[1] - a[1] || a[1] - a[0] - (b[1] - b[0]));
  for (const [from, to] of runs) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const path = assemble(decoded, from, to);
    if (!candidates.includes(path)) candidates.push(path);
  }
  return candidates;
}

export interface ResolveProjectOptions {
  /**
   * Arbeitsverzeichnisse aus den JSONL-Records dieses Ordners, juengste zuerst.
   * Sie gewinnen immer — sie stehen in der Datei, alles andere ist geraten.
   */
  cwds?: readonly string[];
  /** Pruefung gegen die Platte, wenn kein Record ein `cwd` traegt. */
  exists?: (path: string) => Promise<boolean>;
}

export interface ResolvedProject {
  /** Arbeitsverzeichnis in Anzeigeform. */
  path: string;
  /** Kurzer Projektname. */
  name: string;
  /** Belegt (Record oder Platte) — oder nur aus dem Ordnernamen geraten? */
  verified: boolean;
}

/**
 * Ordnername → Arbeitsverzeichnis. Reihenfolge der Wahrheiten:
 * 1. ein `cwd` aus den Records, das genau auf diesen Ordnernamen zurueckfuehrt,
 * 2. sonst das juengste `cwd` aus den Records (die Datei weiss es besser als wir),
 * 3. sonst der erste Kandidat, den es auf der Platte gibt,
 * 4. sonst der plausibelste Kandidat — ausdruecklich unbestaetigt.
 */
export async function resolveProjectPath(
  dirName: string,
  options: ResolveProjectOptions = {},
): Promise<ResolvedProject> {
  const cwds = options.cwds ?? [];
  const matching = cwds.find((cwd) => cwd.length > 0 && slugMatchesDir(cwd, dirName));
  const fromRecords = matching ?? cwds.find((cwd) => cwd.length > 0);
  if (fromRecords !== undefined) return resolved(fromRecords, true);

  const candidates = pathCandidates(dirName);
  if (options.exists !== undefined) {
    for (const candidate of candidates) {
      if (await options.exists(candidate)) return resolved(candidate, true);
    }
  }
  return resolved(candidates[0] ?? dirName, false);
}

function resolved(path: string, verified: boolean): ResolvedProject {
  const normalized = normalizePath(path);
  return { path: normalized, name: projectNameOf(normalized), verified };
}
