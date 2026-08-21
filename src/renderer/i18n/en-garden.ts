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
  'garden.run.step': '{done} of {total}',
  'garden.run.cancelled': 'Cancelled. The last report stays as it was.',

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
  'garden.health.withModel': 'interpreted with a model',
  'garden.health.withoutModel': 'without a model, machine checks only',

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

  // ── Filter ────────────────────────────────────────────────────────────────
  'garden.filter.label': 'Filter results',
  'garden.filter.kind': 'Kind',
  'garden.filter.module': 'Module',
  'garden.filter.severity': 'Weight',
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

  // ── Card ──────────────────────────────────────────────────────────────────
  'garden.card.files': 'Files affected',
  'garden.card.openFile': 'Open the file',
  'garden.card.openThis': 'Open “{path}”',
  'garden.card.preview': 'What gets written to {file}:',
  'garden.card.previewNothing': 'Writes nothing. Only opens where the work continues.',
  'garden.card.dismiss': 'Fine as it is',
  'garden.card.dismissed': 'Fine as it is. The result no longer counts against the health score.',
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

  // ── Without a model ───────────────────────────────────────────────────────
  'garden.llm.title': 'What a model would also find',
  'garden.llm.body':
    'Contradictions between two pages, near duplicates and frequently named terms without their own page. Everything beyond that is listed above in full.',
} as const;
