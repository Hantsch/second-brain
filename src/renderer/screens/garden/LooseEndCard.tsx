/* A loose end (020): a day announced something for a later date, that date has
 * come and gone, and nothing since says how it went.
 *
 * No fix exists — only a human knows what happened, so `finding.fix` is always
 * `null` here (`core/gardener/checks/loose-end.ts`). What the card adds beyond
 * the generic `FindingCard` is exactly two things:
 *
 * - **The evidence, spelled out.** `finding.title`/`.detail` already carry the
 *   quote and the day baked into one finished, localized sentence — but this
 *   card names them as their own lines besides, the way `ContradictionCard`
 *   names its two sides rather than leaving them folded into a paragraph.
 *   Neither the raw quote nor the announcing day travels on `GardenerFinding`
 *   as its own field, so both are read back from what does: the day from the
 *   last path segment of the announcing file (`journal/2026/08/2026-08-10.md`,
 *   `core/journal/day.ts#pathFor`), the quote from the one place it survives
 *   verbatim — the tail of the title, which `core/gardener/labels.ts#looseEnd`
 *   always closes with `: "<quote>"` in either language.
 * - **The answer field.** Through 017's `extraActions` slot, so dismiss,
 *   snooze, "handled in the files" and open stay exactly 017's own paths —
 *   this card contributes one more way out, it doesn't touch the others.
 *   Submitting calls `onAnswer`, which owns the write (020 D5) and the local
 *   removal from the list; the field clears itself once accepted.
 *
 * The clickable path is not repeated here: `FindingCard` already lists every
 * one of `finding.paths` as an "open where the file lives" button — the
 * announcing day's file among them, since it's the finding's only path.
 */

import { useState } from 'react';
import type { GardenerFinding } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Input } from '../../atoms/Input';
import { FindingCard } from '../../components/FindingCard';
import { useLanguage, useT } from '../../i18n';
import { formatDate } from '../../lib/format';
import { leafOf } from './targets';

/* Both languages close the title with `: "<quote>"` (German: `„…"`, English:
 * `"…"`) — one pattern reads either, since the quote and colon-plus-quote
 * shape are the only thing they share. */
const QUOTE_IN_TITLE = /:\s*[„"'“]([\s\S]*)["'”]\s*$/u;

function quoteOf(finding: GardenerFinding): string {
  return QUOTE_IN_TITLE.exec(finding.title)?.[1] ?? finding.title;
}

/* `pathFor` (`core/journal/day.ts`) always ends a day's file in its own ISO
 * date — the one place the announcing day survives without re-parsing the
 * title's localized sentence. */
const DAY_IN_LEAF = /^(\d{4}-\d{2}-\d{2})\.md$/;

function dayOf(finding: GardenerFinding): string | null {
  return DAY_IN_LEAF.exec(leafOf(finding.paths[0] ?? ''))?.[1] ?? null;
}

export interface LooseEndCardProps {
  finding: GardenerFinding;
  busy?: boolean;
  onFix: (finding: GardenerFinding) => void;
  onDismiss: (finding: GardenerFinding) => void;
  onSnooze: (finding: GardenerFinding, days: number, until: string) => void;
  onRecheck: (finding: GardenerFinding) => void;
  onOpenPath: (path: string) => void;
  onOpenFile: (path: string) => void;
  /** Writes the answer through 020 D5's channel. The caller owns the mutation
      and the removal from the list — this card only reports what to write. */
  onAnswer: (finding: GardenerFinding, day: string, text: string) => void;
}

export function LooseEndCard({
  finding,
  busy = false,
  onFix,
  onDismiss,
  onSnooze,
  onRecheck,
  onOpenPath,
  onOpenFile,
  onAnswer,
}: LooseEndCardProps) {
  const t = useT();
  const language = useLanguage();
  const [text, setText] = useState('');
  const day = dayOf(finding);

  const submit = (): void => {
    const trimmed = text.trim();
    if (trimmed.length === 0 || day === null) return;
    onAnswer(finding, day, trimmed);
    setText('');
  };

  return (
    <FindingCard
      finding={finding}
      busy={busy}
      onFix={onFix}
      onDismiss={onDismiss}
      onSnooze={onSnooze}
      onRecheck={onRecheck}
      onOpenPath={onOpenPath}
      onOpenFile={onOpenFile}
      extraActions={
        day === null ? null : (
          <span className="sb-looseend-answer">
            <Input
              className="sb-looseend-answer-input"
              label={t('garden.looseEnd.answerLabel')}
              placeholder={t('garden.looseEnd.answerPlaceholder')}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              icon="check"
              loading={busy}
              disabled={text.trim().length === 0}
              onClick={submit}
            >
              {t('garden.looseEnd.answerSubmit')}
            </Button>
          </span>
        )
      }
    >
      <blockquote className="sb-looseend-quote">
        {t('garden.looseEnd.quote', { quote: quoteOf(finding) })}
      </blockquote>
      <p className="sb-finding-note">
        {t('garden.looseEnd.announced', { day: day === null ? '' : formatDate(day, language) })}
      </p>
      <p className="sb-finding-note">
        {t(
          finding.origin === 'model'
            ? 'garden.looseEnd.foundByModel'
            : 'garden.looseEnd.foundByHeuristic',
        )}
      </p>
    </FindingCard>
  );
}
