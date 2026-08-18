/* English interface strings, part 1: shell, shared building blocks, errors,
   tasks. The screen strings live in `en-screens.ts`.

   Same key set as `de.ts` — enforced by the type below and by
   tests/renderer/i18n.test.ts. Sentence case, no emoji. */

import type { TranslationKey } from './de';
import { enAgents } from './en-agents';
import { enDashboard } from './en-dashboard';
import { enGarden } from './en-garden';
import { enJournal } from './en-journal';
import { enNotes } from './en-notes';
import { enProjects } from './en-projects';
import { enScreens } from './en-screens';
import { enSettings } from './en-settings';
import { enWiki } from './en-wiki';

export const en: Record<TranslationKey, string> = {
  'app.name': 'Second brain',

  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.open': 'Open',
  'common.retry': 'Try again',
  'common.loading': 'Loading',
  'common.search': 'Search',
  'common.details': 'Show details',
  'common.save': 'Save',
  'common.undo': 'Undo',
  'common.showAll': 'Show all {count}',
  'common.openInEditor': 'Open in editor',

  'titlebar.minimize': 'Minimise window',
  'titlebar.maximize': 'Maximise window',
  'titlebar.restore': 'Restore window',
  'titlebar.close': 'Close window',
  'titlebar.search': 'Search or ask',
  'titlebar.searchAria': 'Open the command palette — search or ask',
  'titlebar.capture': 'Capture',
  'titlebar.captureAria': 'Capture a thought',

  'rail.region': 'Main navigation',
  'rail.dashboard': 'Dashboard',
  'rail.inbox': 'Inbox',
  'rail.projects': 'Projects',
  'rail.journal': 'Journal',
  'rail.notes': 'Notes',
  'rail.knowledge': 'Knowledge',
  'rail.garden': 'Care',
  'rail.settings': 'Settings',

  'time.today': 'today',
  'time.yesterday': 'yesterday',
  'time.daysAgo': '{count} days ago',
  'due.overdue': '{count} days overdue',
  'due.overdueOne': 'overdue since yesterday',
  'due.today': 'due today',
  'due.tomorrow': 'due tomorrow',
  'due.inDays': 'due in {count} days',
  'due.none': 'no date',

  'scope.work': 'Work',
  'scope.private': 'Private',

  'project.status.idea': 'Idea',
  'project.status.active': 'Active',
  'project.status.waiting': 'Waiting',
  'project.status.paused': 'Paused',
  'project.status.done': 'Done',
  'project.status.dropped': 'Dropped',

  'palette.title': 'Commands',
  'palette.placeholder': 'Jump, capture, search',
  'palette.mode.label': 'Mode',
  'palette.mode.palette': 'Commands',
  'palette.mode.ask': 'Ask',
  'palette.ask.placeholder': 'What do you want to know?',
  'palette.ask.hint': 'Enter asks, Esc closes, Tab back to the commands',
  'palette.empty': 'No match',
  'palette.group.screens': 'Places',
  'palette.group.actions': 'Actions',
  'palette.group.search': 'Search',
  'palette.screen.sources': 'Sources',
  'palette.screen.agentSessions': 'Agent sessions',
  'palette.action.capture': 'Capture a thought',
  'palette.action.captureWindow': 'Capture window',
  'palette.action.ask': 'Ask a question',
  'palette.hint': 'Arrows select, Enter opens, Esc closes, Tab asks',

  'error.title': 'That did not work',
  'error.details': 'Show details',
  'error.detailsHide': 'Hide details',
  'error.retry': 'Try again',
  'error.code.no-vault': 'No vault is open.',
  'error.code.not-found': 'What you asked for does not exist (any more).',
  'error.code.conflict': 'The file changed in the meantime. Nothing was overwritten.',
  'error.code.llm-unavailable': 'No language model is reachable for this step.',
  'error.code.invalid': 'That input does not fit.',
  'error.code.io': 'File access failed.',
  'error.code.cancelled': 'Cancelled.',
  'error.code.unknown': 'Unexpected error.',
  'error.about.no-vault': 'No vault is open for “{subject}”.',
  'error.about.not-found': '“{subject}” does not exist (any more).',
  'error.about.conflict': '“{subject}” changed in the meantime. Nothing was overwritten.',
  'error.about.llm-unavailable': 'No language model is reachable for “{subject}”.',
  'error.about.invalid': '“{subject}” does not fit.',
  'error.about.io': '“{subject}” could not be opened — the folder is not writable.',
  'error.about.cancelled': '“{subject}” was cancelled.',
  'error.about.unknown': 'Something unexpected happened with “{subject}”.',

  'llm.missing.title': 'This step needs a model',
  'llm.missing.body':
    'The task “{task}” needs a language model. Everything that works without one stays usable.',
  'llm.missing.action': 'Set up routing',
  'llm.note.query-answer':
    'Cited answers in prose need a model — the app shows the passages without one.',
  'llm.note.classify-dump':
    'Filing proposals need a model — capturing and filing work without one.',
  'llm.note.project-status':
    'A reasoned suggestion needs a model — the rule-based one works without.',
  'llm.note.gardener-audit':
    'Contradictions, near duplicates and terms without a page need a model — the machine checks run without one.',
  'llm.note.action': 'Set up routing',

  'vault.none': 'No vault',
  'vault.choose': 'Open a vault',
  'vault.docs': '{count} documents',
  'vault.indexing': 'Building the index',
  'vault.indexed': 'Index up to date',
  'vault.noIndex': 'No index',
  'vault.statusAria': 'Vault status, opens the settings',

  'toast.region': 'Notifications',
  'toast.dismiss': 'Dismiss notification',
  'toast.classifyFailed': 'The filing proposal could not be built. Try again from the inbox.',
  'toast.hotkeyBusy': 'The quick capture shortcut is taken. Change it in the settings.',
  'toast.keyNotPersisted':
    'This machine cannot store keys encrypted. The key lasts until you quit.',

  /* Keys come from `src/core/llm/presets.ts`. */
  'llm.preset.ollama.hint':
    'Runs on this machine. No key needed, first choice for journal and dumps.',
  'llm.preset.lmstudio.hint': 'Local LM Studio server. The loaded model must be active there.',
  'llm.preset.openai.hint': 'Cloud. The key stays encrypted on this machine, the content does not.',
  'llm.preset.openrouter.hint': 'One key for many models. Good for comparing them.',
  'llm.preset.anthropic.hint':
    'Claude models over the Messages API. Strong at distilling and linking.',
  'llm.preset.custom-openai.hint':
    'For vLLM, llama.cpp, Azure or any other service with /chat/completions.',

  'task.classify-dump.label': 'Sort a dump',
  'task.classify-dump.hint':
    'Reads a raw thought and proposes where it belongs. Personal — a local model is the better choice.',
  'task.title-tags.label': 'Title and tags',
  'task.title-tags.hint': 'The shortest task in the app. A small model is enough.',
  'task.extract-tasks.label': 'Extract todos',
  'task.extract-tasks.hint':
    'Finds tasks, deadlines and waiting-for in the text. Small model, structured answer.',
  'task.summarize-source.label': 'Distil a source',
  'task.summarize-source.hint':
    'Turns a transcript or document into a cited source page. Needs context stamina.',
  'task.wiki-ingest.label': 'Tend the wiki',
  'task.wiki-ingest.hint':
    'Writes entity and concept pages and links them up. The most demanding task.',
  'task.query-answer.label': 'Answer a question',
  'task.query-answer.hint':
    'Answers strictly from the retrieved passages, with quotes. Mistakes show most here.',
  'task.query-rerank.label': 'Rerank hits',
  'task.query-rerank.hint': 'Sorts search hits by fit to the question. A small model is enough.',
  'task.journal-chat.label': 'Journal conversation',
  'task.journal-chat.hint':
    'The most personal conversation in the app. A local model is explicitly recommended.',
  'task.project-status.label': 'Project status',
  'task.project-status.hint':
    'Derives status and next step from the project history — as a proposal.',
  'task.gardener-audit.label': 'Interpret results',
  'task.gardener-audit.hint':
    'Finds contradictions, stale claims and missing pages. Needs judgement.',

  /* Notes from ingesting. The core knows no language and sends a code
     (`IngestNoteCode`); the sentence lives here. Every refusal states something about
     the source instead of apologising. */
  'ingest.note.pdf-not-read':
    'PDFs are not read yet — the file is stored as a source, please paste the text.',
  'ingest.note.binary-not-read':
    'This file type is not read — the file is stored as a source, please paste the text.',
  'ingest.note.no-transcript':
    'The video has no subtitles. Metadata and description are stored anyway.',
  'ingest.note.partial-metadata': 'Part of the metadata is missing.',
  'ingest.note.ytdlp-missing':
    'yt-dlp is missing. Fetched via the fallback — without chapter markers and without manual subtitles.',
  'ingest.note.content-truncated': 'The source was larger than 5 MB and was truncated.',
  'ingest.note.unsupported-content': 'This address returns no text.',
  'ingest.note.awaiting-llm': 'The raw source is stored. Distilling needs a model.',
  'ingest.note.already-condensed':
    'This source is already condensed. A second run would add a second source page for the same content — so it ends here.',

  ...enScreens,
  ...enAgents,
  ...enDashboard,
  ...enGarden,
  ...enJournal,
  ...enNotes,
  ...enProjects,
  ...enSettings,
  ...enWiki,
};
