/* Companion to `core/llm/redact.ts` for a different shape of secret (034, D7;
   guardrail 6). That module keeps an API key out of a log line; this one
   keeps a filesystem path — the model directory, the `.gguf` file name, the
   engine binary — out of one. A path says something about the user's machine
   (folder structure, usernames, model choices) that a key redactor was never
   built to catch, and 034's own AC 8 names it explicitly: "no file path from
   the model directory appears in a log line."

   `llamacpp-engine-start.ts` and `llamacpp-autostart.ts` both log a bare,
   static string today — nothing interpolated, so nothing to redact yet. This
   module is what a future edit to either call site would have to actively
   bypass in order to leak a path: wrapping the message through
   `redactPathLikeStrings` costs nothing while the string stays static, and
   quietly starts doing its job the moment someone appends a detail to it. */

const REDACTED = '<redacted>';

/** Shapes a path can take in a log message: any whitespace-free token that
    contains a `/` or `\` separator (covers a Windows drive-letter path, a
    POSIX absolute path, and a relative one alike), or a bare `.gguf` file
    name with no separator at all — the one artifact this module's callers
    ever have reason to mention. Matched greedily up to the next whitespace,
    the same "best effort, not a parser" stance `llamacpp-engine-start.ts`'s
    own stderr classification already takes for a different kind of text. */
const PATH_PATTERNS: readonly RegExp[] = [/\S*[\\/]\S*/g, /\S*\.gguf\b/gi];

/** Removes anything that looks like a filesystem path from free text. Mirrors
    `redactKeyLikeStrings`'s shape-based approach: it does not know which path
    a caller might one day interpolate, only what a path generally looks like. */
export function redactPathLikeStrings(text: string): string {
  return PATH_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, REDACTED), text);
}

/** Flags whose next argv token names a path in llama.cpp's own flag shape
    (`-m <path>`, `--model <path>`) — checked in addition to the shape-based
    patterns above, in case a relative file name without any separator ever
    reaches this far. */
const PATH_FLAGS: ReadonlySet<string> = new Set(['-m', '--model']);

/**
 * Makes an argv array loggable: every path-shaped token, and whatever
 * follows a path-carrying flag, replaced. What survives — `-ngl 28 -c 4096
 * -t 6 --port 11435` — is exactly D1's derived flags plus the port; neither
 * names a file or a machine. No call site logs `argv` today (guardrail 6
 * already holds without this), but a future one now has a one-line way to
 * stay honest instead of interpolating the array directly.
 */
export function redactCommandLine(argv: readonly string[]): string {
  return argv
    .map((token, index) => {
      const previous = index > 0 ? argv[index - 1] : undefined;
      if (previous !== undefined && PATH_FLAGS.has(previous)) return REDACTED;
      return redactPathLikeStrings(token) === token ? token : REDACTED;
    })
    .join(' ');
}

/**
 * What the two existing `console.warn` call sites (`llamacpp-engine-
 * start.ts`'s failed baseUrl write-back, `llamacpp-autostart.ts`'s failed
 * auto-start) pass their message through before logging it — defensively:
 * both messages are bare, static strings today, so this changes nothing
 * about what is printed. It exists so a later edit that appends a detail to
 * either string has to go out of its way to defeat it, rather than the
 * opposite.
 */
export function safeLlamaLogLine(message: string): string {
  return redactPathLikeStrings(message);
}
