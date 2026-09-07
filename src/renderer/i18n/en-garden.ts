/* English interface texts for gardening. Same key set as `de-garden.ts` — a test
   checks that. Sentence case, no emoji, statements instead of exclamations. */

export const enGarden = {
  // ── Run ───────────────────────────────────────────────────────────────────
  'garden.run.action': 'Check now',
  'garden.run.again': 'Check again',
  'garden.run.cancel': 'Cancel check',
  'garden.run.running': 'Check running',
  'garden.run.check': 'Check: {check}',
  'garden.run.audit': 'The model is interpreting the results',
  'garden.run.looseEnds': 'The model is checking loose ends',
  'garden.run.step': '{done} of {total}',
  'garden.run.remaining': 'Still to come: {list}',
  'garden.run.stage.checks': 'checks',
  'garden.run.stage.audit': 'contradictions',
  'garden.run.stage.loose-ends': 'loose ends',
  'garden.run.elapsed': 'Elapsed {elapsed}',
  /* 021a D6: shows only when this run's stage plan has no model stage at
     all — not merely that one hasn't come up yet. Deliberately without a
     cause: the renderer cannot tell "no model configured" apart from
     "switched off for this run". */
  'garden.run.noModelStage': 'No model stage — contradictions and loose ends are not checked.',
  'garden.run.disabledWhileRunning': 'A maintenance run is already going.',
  /* 021b, D4: the button next to "check now" — present only when the last
     run stopped partway and stages are still missing. */
  'garden.run.continue': 'Continue check',
  /* 021c, D3: "check only this" next to the filter — active exactly when the
     kind or module axis narrows the view, naming what it would run. */
  'garden.run.checkOnlyKind': 'Check only {kind}',
  'garden.run.checkOnlyModule': 'Check only module {module}',
  'garden.run.checkOnlyBoth': 'Check only {kind} in module {module}',

  // ── Scope of the last run (021c, D4) ────────────────────────────────────────
  /* Names what a scoped run covered — next to 021b's frozen-score wording,
     never replacing it. A scoped run is never `complete`, but it must not
     read as the "stopped partway" sentence below: nothing was skipped, the
     run just never intended to cover more. */
  'garden.scope.kind': 'Last check: {kind} only',
  'garden.scope.module': 'Last check: module {module} only',
  'garden.scope.both': 'Last check: {kind} in module {module} only',
  /* The way back to a full run, offered beside the scope wording. */
  'garden.scope.checkEverything': 'Check everything',

  // ── Stopped partway ──────────────────────────────────────────────────────
  /* 021b, D4: the last run did not reach every stage it planned — the report
     says so honestly, instead of staying quiet about it. */
  'garden.stopped.title': 'Stopped partway.',
  'garden.stopped.missing': 'Missing stages: {list}.',
  /* 042, D4: button on the run strip to put the offer away without
     continuing — the strip is then empty again until the next run starts. */
  'garden.stopped.dismiss': 'Dismiss',

  // ── Health ────────────────────────────────────────────────────────────────
  'garden.health.label': 'Health',
  'garden.health.aria': 'Health {score} out of 100',
  'garden.health.unknown': 'Not checked yet',
  'garden.health.unknownBody':
    'There is no check yet. Without one there is no score — a 100 would be invented.',
  'garden.health.noStock':
    'Nothing for a score to refer to: no pages, no projects, no sources, no dumps.',
  'garden.health.why': 'Where the score comes from',
  'garden.health.perfect': 'Nothing pulls the score down: the check returned no results.',
  'garden.health.lost': '{count} of 100 points come from these results.',
  'garden.health.pointOne': '1 point',
  'garden.health.points': '{count} points',
  'garden.health.ranAt': 'Last checked',
  /* 021b, D4: shown instead of the live timestamp when the score is frozen
     from the last complete run — this run did not recompute it. */
  'garden.health.asOf': 'As of {when}, last complete check',
  /* And when the stop had nothing to freeze — the first check on this vault
     was the one that got stopped. There is no complete check to point at, so
     the score stays unknown rather than being derived from half a run. */
  'garden.health.noComplete': 'No complete check yet',
  'garden.health.noCompleteBody':
    'The check was stopped before it finished, and there is no earlier complete one. A score over half a check would not be this vault’s health.',
  'garden.health.withModel': 'interpreted with a model',
  'garden.health.withoutModel': 'without a model, machine checks only',
  'garden.health.hiddenOne':
    '1 result is excluded from this score: {dismissed} marked as not a problem, {snoozed} not now.',
  'garden.health.hidden':
    '{total} results are excluded from this score: {dismissed} marked as not a problem, {snoozed} not now.',
  'garden.health.showHidden': 'Show excluded results',

  // ── Advice ────────────────────────────────────────────────────────────────
  'garden.advice.label': 'What to do next',
  'garden.advice.fromModel': 'Interpreted by the model.',
  'garden.advice.heuristic': 'Derived from the number and weight of the results, without a model.',
  'garden.advice.orphan':
    'Add a reference to orphaned pages — through links nobody finds them otherwise.',
  'garden.advice.broken-link': 'Correct broken wikilinks in the lines named.',
  'garden.advice.index-drift': 'Add missing catalogue lines, one per page.',
  'garden.advice.stale-page': 'Read stale pages and mark them as reviewed.',
  'garden.advice.unfiled-dump': 'Sort dumps left lying around.',
  'garden.advice.unprocessed-source': 'Distil raw sources into source pages.',
  'garden.advice.project-without-next-step': 'Settle one sentence per project without a next step.',
  'garden.advice.contradiction': 'Name contradictions — both versions stay.',
  'garden.advice.near-duplicate': 'Compare near duplicates and merge where it is the same thing.',
  'garden.advice.missing-page': 'Give frequently named terms their own pages.',
  'garden.advice.loose-end': 'Follow up on announced sentences — answer or mark them done.',
  'garden.advice.condensation-due':
    'Open areas and projects with a condensation due and condense them again.',

  // ── Findings ──────────────────────────────────────────────────────────────
  'garden.findings.label': 'Results',
  'garden.findings.totalOne': '1 result',
  'garden.findings.total': '{count} results',
  'garden.findings.shown': '{shown} of {total} shown',
  'garden.findings.none': 'No results.',
  'garden.findings.noneBody':
    'Checked: wiki pages and catalogues, raw sources, dumps in the inbox, and projects without a next step.',
  'garden.findings.filtered': 'No result matches this filter.',
  'garden.checkedAt': 'Last checked: {when}',
  'garden.findings.hiddenOne': '1 hidden',
  'garden.findings.hidden': '{count} hidden',

  // ── Filter ────────────────────────────────────────────────────────────────
  'garden.filter.label': 'Filter results',
  'garden.filter.kind': 'Kind',
  'garden.filter.module': 'Module',
  'garden.filter.severity': 'Weight',
  'garden.filter.state': 'Status',
  'garden.filter.stateOpen': 'Open',
  'garden.filter.stateDismissed': 'Not a problem',
  'garden.filter.stateSnoozed': 'Not now',
  'garden.filter.all': 'All',
  'garden.filter.noModule': 'Without a module',
  'garden.filter.reset': 'Reset the filter',
  'garden.severity.high': 'High',
  'garden.severity.warn': 'Medium',
  'garden.severity.info': 'Low',

  // ── Kinds ─────────────────────────────────────────────────────────────────
  'garden.kind.orphan': 'Orphaned pages',
  'garden.kind.broken-link': 'Broken wikilinks',
  'garden.kind.index-drift': 'Catalogue drift',
  'garden.kind.stale-page': 'Stale pages',
  'garden.kind.contradiction': 'Contradictions',
  'garden.kind.missing-page': 'Terms without a page',
  'garden.kind.near-duplicate': 'Near duplicates',
  'garden.kind.unfiled-dump': 'Dumps left lying around',
  'garden.kind.unprocessed-source': 'Undistilled sources',
  'garden.kind.project-without-next-step': 'Projects without a next step',
  'garden.kind.loose-end': 'Loose ends',
  'garden.kind.condensation-due': 'Condensations due',

  'garden.countOne.orphan': '1 orphaned page',
  'garden.countMany.orphan': '{count} orphaned pages',
  'garden.countOne.broken-link': '1 broken wikilink',
  'garden.countMany.broken-link': '{count} broken wikilinks',
  'garden.countOne.index-drift': '1 catalogue entry',
  'garden.countMany.index-drift': '{count} catalogue entries',
  'garden.countOne.stale-page': '1 stale page',
  'garden.countMany.stale-page': '{count} stale pages',
  'garden.countOne.contradiction': '1 contradiction',
  'garden.countMany.contradiction': '{count} contradictions',
  'garden.countOne.missing-page': '1 term without a page',
  'garden.countMany.missing-page': '{count} terms without a page',
  'garden.countOne.near-duplicate': '1 near duplicate',
  'garden.countMany.near-duplicate': '{count} near duplicates',
  'garden.countOne.unfiled-dump': '1 dump left lying around',
  'garden.countMany.unfiled-dump': '{count} dumps left lying around',
  'garden.countOne.unprocessed-source': '1 undistilled source',
  'garden.countMany.unprocessed-source': '{count} undistilled sources',
  'garden.countOne.project-without-next-step': '1 project without a next step',
  'garden.countMany.project-without-next-step': '{count} projects without a next step',
  'garden.countOne.loose-end': '1 loose end',
  'garden.countMany.loose-end': '{count} loose ends',
  'garden.countOne.condensation-due': '1 condensation due',
  'garden.countMany.condensation-due': '{count} condensations due',

  // ── Card ──────────────────────────────────────────────────────────────────
  'garden.card.files': 'Files affected',
  'garden.card.openFile': 'Open the file',
  'garden.card.openThis': 'Open “{path}”',
  'garden.card.preview': 'What gets written to {file}:',
  'garden.card.previewNothing': 'Writes nothing. Only opens where the work continues.',
  'garden.card.noFix': 'Nothing here can be put right on its own. The ways out are below.',
  'garden.card.dismiss': 'This is not a problem',
  'garden.card.dismissed': 'Not a problem. The result no longer counts against the health score.',
  'garden.card.handled': 'I dealt with it in the files',
  'garden.card.recheckGone': 'Checked again: the result is gone.',
  'garden.card.recheckStill':
    'Checked again: the result is still there. Nothing about it changed in the files.',
  'garden.card.snooze': 'Not now: “{title}”',
  'garden.card.snoozed': 'Not now. The result comes back on {date}.',
  'garden.card.unsnoozed': 'The result counts again.',
  'garden.card.undismiss': 'Show it again',
  'garden.card.written': 'Written: {file}',
  'garden.card.discarded': '“{file}” is now in the trash.',
  'garden.card.undo': 'Undo',
  'garden.card.undone': 'Rolled back.',
  'garden.card.keptOne': '1 file was left alone: it has been edited since.',
  'garden.card.kept': '{count} files were left alone: they have been edited since.',
  'garden.card.opened': 'Opened: {path}',
  'garden.card.alsoOpen': 'The second file: {path}',
  'garden.card.openSecond': 'Open the second file',

  // ── Hidden ────────────────────────────────────────────────────────────────
  'garden.hidden.dismissed': 'This is not a problem.',
  'garden.hidden.snoozed': 'Comes back on {date}.',

  // ── Contradiction ─────────────────────────────────────────────────────────
  'garden.contradiction.never': 'Never resolved automatically: both versions stay.',
  'garden.contradiction.section': 'The “Contradictions” section of this page',
  'garden.contradiction.excerpt': 'Start of the page — the passage is not named in the file',
  'garden.contradiction.updated': 'As of',
  'garden.contradiction.name': 'Keep both and name it',
  'garden.contradiction.supersede': '“{newer}” supersedes “{older}”',
  'garden.contradiction.supersedeHint':
    'Writes supersedes: [{slug}] into {file}. Both pages stay; the older one is marked as superseded.',
  'garden.contradiction.sameDate':
    'Both pages carry the same date. Which one is older is a human decision — in the file.',
  'garden.contradiction.named':
    'The contradiction is named on the page. There is nothing to write.',
  'garden.contradiction.superseded': 'Written into {file}.',

  // ── Near duplicate ────────────────────────────────────────────────────────
  'garden.nearDuplicate.created': 'Created',
  'garden.nearDuplicate.neverMerged':
    'Never merged automatically: “Compare both pages” only opens the two files.',
  'garden.nearDuplicate.directionLabel': 'Which page is the newer one?',
  'garden.nearDuplicate.noDefault':
    'No suggestion: one page has no created date, or both carry the same one. A human decides here.',
  'garden.nearDuplicate.optionNewer': '“{file}” is the newer page',
  'garden.nearDuplicate.supersede': 'Supersede: {older} → {newer}',
  'garden.nearDuplicate.supersedeHint':
    'Writes supersedes: [{slug}] into {file}. Both pages stay; the older one is marked as superseded.',
  'garden.nearDuplicate.alreadyNamed': 'This relation is already named. There is nothing to write.',
  'garden.nearDuplicate.pageMissing':
    'One of the two pages cannot be read — it may already be in the trash. The next run says what is left of the pair.',

  // ── Orphaned page: choose a target ────────────────────────────────────────
  'garden.orphan.targetLabel': 'Target page',
  'garden.orphan.empty': 'No other page in this module to link it from.',
  'garden.orphan.fromOverview': 'Link from the “{module}” module overview',
  'garden.orphan.pickToggle': 'Choose a different page',
  'garden.orphan.searchLabel': 'Search pages',
  'garden.orphan.pickPlaceholder': 'Choose a page',
  'garden.orphan.pickAria': 'Choose the target page',
  'garden.orphan.noMatch': 'No page matches “{query}”.',
  'garden.orphan.confirm': 'Add the reference to “{file}”',

  // ── Discard ───────────────────────────────────────────────────────────────
  'garden.discard.action': 'Discard “{file}”',
  'garden.discard.title': 'Discard “{file}”?',
  'garden.discard.inboundNone': 'No other page links to it.',
  'garden.discard.inboundOne': '1 page links to this page.',
  'garden.discard.inboundMany': '{count} pages link to this page.',
  'garden.discard.catalogPreview': 'This catalogue line would be removed:',
  'garden.discard.catalogNone': 'No catalogue line to remove.',
  'garden.discard.repoint': 'Repoint links at “{file}” instead',
  'garden.discard.willBreak':
    'These links would break — there is no surviving page to repoint them at.',
  'garden.discard.confirm': 'Discard',

  // ── Loose end ─────────────────────────────────────────────────────────────
  'garden.looseEnd.empty': 'No loose ends.',
  'garden.looseEnd.quote': '“{quote}”',
  'garden.looseEnd.announced': 'Announced on {day}. Nothing since.',
  'garden.looseEnd.foundByHeuristic': 'Found by the built-in check.',
  'garden.looseEnd.foundByModel': 'Found by the model.',
  'garden.looseEnd.answerLabel': 'Answer',
  'garden.looseEnd.answerPlaceholder': 'What came of it?',
  'garden.looseEnd.answerSubmit': 'Record',

  // ── Without a model ───────────────────────────────────────────────────────
  'garden.llm.title': 'What a model would also find',
  'garden.llm.body':
    'Contradictions between two pages, near duplicates and frequently named terms without their own page. Everything beyond that is listed above in full.',

  // ── Closing during a run (042/074, D7) ───────────────────────────────────
  /* Only the stop is offered, never a plain "close anyway" — a write could
     still be in progress (the story's Decisions). Not just maintenance since
     074: `{kinds}` names every currently-running task that vetoed the close
     (condense, take in source, …), comma-separated. */
  'garden.quit.title': 'Still running: {kinds}.',
  'garden.quit.body':
    'Stopping it now ends it cleanly. Closing without stopping is not offered — a write could still be in progress.',
  'garden.quit.stopAndClose': 'Stop and close',
  'garden.quit.cancel': 'Cancel',
} as const;
