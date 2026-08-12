#!/usr/bin/env node
/* Legt `.demo-vault/` mit erfundenen, aber glaubwürdigen Inhalten an — die
   Grundlage jeder Oberflächenprüfung. Format: docs/VAULT-FORMAT.md.

   Aufruf:
     node scripts/seed-vault.mjs [--out <pfad>] [--quiet] [--force]

   Alles ist an „heute" gehängt: Fristen bleiben Fristen, Altes bleibt alt, egal
   wann der Seed läuft. Gelöscht wird nur ein Ordner, der den Demo-Marker trägt —
   ein echter Vault ist gegen einen Tippfehler in `--out` geschützt (`--force`
   hebt das auf). */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFindings, checkVault } from './seed/check.mjs';
import { seedChats } from './seed/chats.mjs';
import { seedClaudeSessions } from './seed/claude.mjs';
import { createClock, Seeder } from './seed/lib.mjs';
import { seedInbox } from './seed/inbox.mjs';
import { seedInternal, VAULT_NAME } from './seed/internal.mjs';
import { seedJournal } from './seed/journal.mjs';
import { seedProjects } from './seed/projects.mjs';
import { seedRaw } from './seed/raw.mjs';
import { identityModule } from './seed/module-identity.mjs';
import { methodikModule } from './seed/module-methodik.mjs';
import { writeModule } from './seed/wiki.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function parseArgs(argv) {
  const options = { out: resolve(repoRoot, '.demo-vault'), quiet: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--quiet') options.quiet = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--out') {
      const value = argv[index + 1];
      if (!value) throw new Error('--out braucht einen Pfad.');
      options.out = isAbsolute(value) ? value : resolve(process.cwd(), value);
      index += 1;
    } else if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length);
      options.out = isAbsolute(value) ? value : resolve(process.cwd(), value);
    } else {
      throw new Error(`Unbekannte Option: ${arg}`);
    }
  }
  return options;
}

/** Nur ein Demo-Vault (oder ein leerer/nicht vorhandener Ordner) darf weg. */
function clearTarget(target, force) {
  if (!existsSync(target)) return;
  const marker = resolve(target, '.secondbrain/vault.json');
  let isDemo = false;
  if (existsSync(marker)) {
    try {
      isDemo = JSON.parse(readFileSync(marker, 'utf8')).demo === true;
    } catch {
      isDemo = false;
    }
  }
  if (!isDemo && !force) {
    throw new Error(
      `${target} ist kein Demo-Vault (kein Marker mit "demo": true). Abgebrochen, ` +
        'damit kein echter Vault gelöscht wird. Mit --force überschreiben.',
    );
  }
  rmSync(target, { recursive: true, force: true });
}

function formatSummary(seeder, findings) {
  const count = (kind) => String(seeder.count(kind)).padStart(3, ' ');
  const lines = [
    `Demo-Vault angelegt: ${seeder.root}`,
    '',
    `  Projekte          ${count('projects')}  (${seeder.count('projects.work')} work, ${seeder.count('projects.private')} privat)`,
    `  Bereiche          ${count('areas')}`,
    `  Projektnotizen    ${count('notes')}`,
    `  Todos             ${count('todos')}  (${seeder.count('todosOpen')} offen, ${seeder.count('todosDone')} erledigt, ${seeder.count('todosDue')} mit Frist, ${seeder.count('todosWaiting')} Warte-auf)`,
    `  Warte-auf         ${count('waitingOn')}  in Projekt-Frontmatter`,
    `  Tageseinträge     ${count('journal')}  (${seeder.count('journalDialogues')} mit Coaching-Dialog)`,
    `  Wissens-Module    ${count('modules')}`,
    `  Wiki-Seiten       ${count('pages')}  (${seeder.count('pages.source')} Quellen, ${seeder.count('pages.entity')} Entitäten, ${seeder.count('pages.concept')} Begriffe, ${seeder.count('pages.overview')} Synthesen)`,
    `  Rohquellen        ${count('raw')}  (${seeder.count('rawProcessed')} verdichtet, ${seeder.count('rawUnprocessed')} offen)`,
    `  Inbox-Dumps       ${count('dumps')}`,
    `  Gespräche         ${count('chats')}  (beantwortet, mit geprüften Belegen)`,
    `  Dateien           ${String(seeder.files.length).padStart(3, ' ')}  (${Math.round(seeder.bytes / 1024)} KiB)`,
    '',
    'Absichtliche Befunde für den Pflege-Screen:',
    `  kaputter Wikilink      ${findings.broken.join(', ')}`,
    `  verwaiste Seite        ${findings.orphans.join(', ')}`,
    `  fehlt im Katalog       ${findings.missingFromIndex.join(', ')}`,
    `  lange nicht geprüft    ${findings.stalePages.join(', ')}`,
    `  benannter Widerspruch  ${findings.contradictions.join(', ')}`,
    `  unverdichtete Quelle   ${findings.unprocessedSources.join(', ')}`,
    `  liegengebliebener Dump ${findings.unfiledDumps.join(', ')}`,
    `  ohne nächsten Schritt  ${findings.withoutNextStep.join(', ')}`,
    '',
    `  Claude-Sitzungen  ${count('claudeSessions')}  (eigene Ablage, nicht das echte ~/.claude)`,
  ];
  return lines.join('\n');
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  clearTarget(options.out, options.force);

  const clock = createClock();
  const seeder = new Seeder(options.out);

  seedInternal(seeder, clock);
  /* Vor den Projekten unerheblich, aber vor dem Start der App zwingend: ohne
     eigene Verlaufsablage liest der Demo-Lauf das echte `~/.claude`. */
  seedClaudeSessions(seeder, clock);
  seedProjects(seeder, clock);
  seedJournal(seeder, clock);
  writeModule(seeder, clock, identityModule(clock));
  writeModule(seeder, clock, methodikModule(clock));
  seedRaw(seeder, clock);
  seedInbox(seeder, clock);
  /* Nach den Modulen: die Belege des Gesprächs werden aus den Seiten gelesen. */
  seedChats(seeder, clock);
  seeder.applyStamps();

  const report = checkVault(options.out, clock.date(0, '12:00'));
  const mismatches = compareFindings(report.findings);
  const problems = [...report.problems, ...mismatches];

  if (!options.quiet) {
    console.log(formatSummary(seeder, report.findings));
    console.log('');
    console.log(
      `Vault-Name: ${VAULT_NAME}. Keine Provider eingetragen — die App muss ohne LLM stehen.`,
    );
  }

  if (problems.length > 0) {
    console.error('\nSelbstprüfung des Seeds fehlgeschlagen:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`Seed fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
