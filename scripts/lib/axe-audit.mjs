/* axe-core over the same visit the screenshot comes from (ui-verify, "The
   accessibility gate"). The shooter in scripts/verify.mjs calls `check()` right
   after each picture, on the very page state in it — "what is in the picture"
   and "what axe found" are one state, not two app instances.

   `serious` and `critical` fail the run; `minor` and `moderate` are reported
   and do not. Next to axe the project's own floor, `--sb-hit`, is read out of
   the stylesheet, so the gate and the design token cannot drift apart. */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { HarnessError, REPO_ROOT } from './app-harness.mjs';

const AXE_SOURCE = join(REPO_ROOT, 'node_modules/axe-core/axe.min.js');
const TOKEN_SHEET = join(REPO_ROOT, 'src/renderer/index.css');
export const BLOCKING = new Set(['serious', 'critical']);

/** `--sb-hit` from src/renderer/index.css, in px. */
export function readHitMin() {
  const match = /--sb-hit:\s*(\d+)px/.exec(readFileSync(TOKEN_SHEET, 'utf8'));
  if (!match) throw new HarnessError(`--sb-hit nicht gefunden in ${TOKEN_SHEET}.`);
  return Number(match[1]);
}

/** axe-core in die Seite legen. Kein Netz, die Datei liegt in node_modules. */
async function injectAxe(page) {
  const already = await page.evaluate(() => typeof window.axe !== 'undefined');
  if (already) return;
  await page.addScriptTag({ content: readFileSync(AXE_SOURCE, 'utf8') });
}

/**
 * Ein Lauf über das ganze Dokument, auf das Wesentliche eingekocht.
 *
 * `target-size` läuft nicht in der Standardauswahl (WCAG 2.2, in axe als
 * „experimental" geführt) — hier ist es ausdrücklich an: „jede interaktive Fläche
 * ≥ 32 px" steht in ARCHITECTURE.md als Pflicht, und eine Pflicht ohne Prüfung
 * kommt zurück. Die Regel misst gegen 24 px (WCAG-Untergrenze); alles darunter
 * ist damit ein Verstoß, der den Lauf bricht.
 */
function runAxe(page) {
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      resultTypes: ['violations'],
      rules: { 'target-size': { enabled: true } },
    });
    return {
      axeVersion: window.axe.version,
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? 'unbekannt',
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.slice(0, 5).map((node) => ({
          target: node.target.join(' '),
          html: node.html.slice(0, 200),
          summary: (node.failureSummary ?? '').split('\n').slice(0, 3).join(' '),
        })),
        nodeCount: violation.nodes.length,
      })),
      passes: result.passes?.length ?? 0,
      incomplete: (result.incomplete ?? []).map((entry) => entry.id),
    };
  });
}

function describe(violations) {
  if (violations.length === 0) return 'ohne Verstoß';
  return violations
    .map((violation) => `${violation.id}[${violation.impact}]×${violation.nodeCount}`)
    .join(', ');
}

export function createAudit() {
  const report = {
    ranAt: new Date().toISOString(),
    axeVersion: null,
    hitMin: readHitMin(),
    screens: [],
    /** Measured hit areas below `--sb-hit` — the project's own floor next to axe. */
    floor: [],
  };

  return {
    report,
    hitMin: report.hitMin,

    /** axe over the page as it is right now. Returns a one-line summary. */
    async check(id, page) {
      try {
        await injectAxe(page);
        const { axeVersion, ...result } = await runAxe(page);
        report.axeVersion ??= axeVersion;
        const blockingCount = result.violations.filter((v) => BLOCKING.has(v.impact)).length;
        report.screens.push({ screen: id, reached: true, ...result, blockingCount });
        return describe(result.violations);
      } catch (error) {
        const why = error instanceof Error ? error.message.split('\n')[0] : String(error);
        report.screens.push({ screen: id, reached: false, why });
        return `axe nicht gelaufen: ${why}`;
      }
    },

    /** A state that never loaded never got a chance to produce findings. */
    unreachable(id, why) {
      report.screens.push({ screen: id, reached: false, why });
    },

    /** Checks one measured hit area against `--sb-hit`; records it when it falls short. */
    measure(id, what, width, height) {
      if (width >= report.hitMin && height >= report.hitMin) return true;
      report.floor.push({ screen: id, what, width, height, hitMin: report.hitMin });
      return false;
    },

    blocking() {
      return report.screens.flatMap((entry) =>
        (entry.violations ?? [])
          .filter((violation) => BLOCKING.has(violation.impact))
          .map((violation) => ({ screen: entry.screen, violation })),
      );
    },

    /** Writes `a11y.json`, prints the summary, returns whether the gate failed. */
    finish(outDir, log) {
      const file = join(outDir, 'a11y.json');
      writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
      const reached = report.screens.filter((entry) => entry.reached);
      const total = reached.reduce((sum, entry) => sum + entry.violations.length, 0);
      const blocking = this.blocking();
      /* „incomplete" heißt: axe konnte es nicht entscheiden (typisch bei Kontrast
         über Farbvariablen). Kein Verstoß, aber der einzige Hinweis darauf, dass
         jemand von Hand nachsehen muss. */
      const undecided = [...new Set(reached.flatMap((entry) => entry.incomplete))];

      log('');
      log(
        `axe-core ${report.axeVersion ?? '?'}: ${reached.length} Zustände, ${total} Verstöße, ` +
          `davon ${blocking.length} blockierend (serious/critical).`,
      );
      for (const entry of report.screens.filter((item) => !item.reached)) {
        log(`  unerreichbar, axe nicht gelaufen: ${entry.screen} — ${entry.why}`);
      }
      if (undecided.length > 0)
        log(`  Unentschieden (bitte von Hand prüfen): ${undecided.join(', ')}`);
      for (const { screen, violation } of blocking) {
        log(`  ${screen}: ${violation.id} (${violation.impact}) — ${violation.help}`);
        for (const node of violation.nodes) log(`      ${node.target}`);
      }
      for (const short of report.floor) {
        log(
          `  ${short.screen}: „${short.what}" ist ${short.width}×${short.height} px, ` +
            `--sb-hit verlangt ${short.hitMin}.`,
        );
      }
      log(`Bericht: ${file}`);
      return blocking.length > 0 || report.floor.length > 0;
    },
  };
}
