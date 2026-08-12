/* D14: one row of a session transcript. Split out of `Transcript.tsx` so
   each row owns its own expand/collapse state locally — toggling one tool
   call's `raw` detail only re-renders that row, never the accumulated list
   above and below it (see the DOM-growth note in `Transcript.tsx`).

   `user`/`assistant` reuse the exact visual language the journal's
   conversation already established (`sb-dturn`/`sb-dturn--{role}` from
   `journal.css`, the same classes `DialogTurn` renders): an overline speaker
   label, a mono timestamp, then the text — one chat convention for the
   whole app instead of a second one invented here. `tool-call`/`tool-result`
   have no equivalent elsewhere, so they get their own compact, collapsed
   row: name and target (or "tool result") on one line, `entry.raw`
   pretty-printed behind a click. The Markdown block's own `.sb-md-pre`
   (`markdown.css`) is reused for that pretty-print — it is already exactly
   "a monospace block on a sunken surface", no reason to define a second
   one. */

import { useState } from 'react';
import type { TranscriptEntry } from '@shared/types';
import type { UiLanguage } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { Markdown } from '../../components/Markdown';
import { useT } from '../../i18n';
import { formatAge } from '../../lib/format';

export interface TranscriptEntryRowProps {
  entry: TranscriptEntry;
  /** Display name for the CLI whose response this is — "Claude Code" or "Codex". */
  agentLabel: string;
  language: UiLanguage;
}

export function TranscriptEntryRow({ entry, agentLabel, language }: TranscriptEntryRowProps) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const time = entry.at === null ? null : formatAge(entry.at, language);

  if (entry.kind === 'user' || entry.kind === 'assistant') {
    const speaker = entry.kind === 'user' ? t('agents.transcript.you') : agentLabel;
    return (
      <article className={`sb-dturn sb-dturn--${entry.kind}`} aria-label={speaker}>
        <header className="sb-dturn-head">
          <span className="gs-overline">{speaker}</span>
          {time === null ? null : <span className="sb-mono sb-dturn-time">{time}</span>}
        </header>
        {entry.kind === 'assistant' ? (
          <Markdown text={entry.text ?? ''} className="sb-dturn-text" />
        ) : (
          <p className="sb-dturn-said">{entry.text}</p>
        )}
      </article>
    );
  }

  // `tool-call` / `tool-result`: one collapsed line, expandable to the raw record.
  const isCall = entry.kind === 'tool-call';
  const toolName = entry.toolName ?? t('agents.transcript.toolNameUnknown');
  const toolTarget = entry.toolTarget ?? t('agents.transcript.toolTargetUnknown');

  return (
    <div className={`sb-transcript-tool sb-transcript-tool--${entry.kind}`}>
      <button
        type="button"
        className="sb-transcript-tool-toggle"
        aria-expanded={expanded}
        aria-label={isCall ? t('agents.transcript.toolCall', { name: toolName }) : undefined}
        onClick={() => setExpanded((value) => !value)}
      >
        <Icon name={expanded ? 'chevron-down' : 'chevron-right'} size={14} />
        <span className="sb-mono sb-transcript-tool-name">
          {isCall ? toolName : t('agents.transcript.toolResult')}
        </span>
        {isCall ? <span className="sb-mono sb-transcript-tool-target">{toolTarget}</span> : null}
        {time === null ? null : <span className="sb-mono sb-transcript-tool-time">{time}</span>}
      </button>
      {expanded ? <pre className="sb-md-pre">{JSON.stringify(entry.raw, null, 2)}</pre> : null}
    </div>
  );
}
