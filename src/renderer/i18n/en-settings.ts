/* English texts for the settings: tabs, vault, languages, behaviour, about.
   The models tab lives in `en-settings-models.ts` and is merged in here, so
   `en.ts` needs a single import. Same key set as `de-settings.ts`. */

import type { SettingsKey } from './de-settings';
import { enSettingsModels } from './en-settings-models';

const own = {
  'settings.tab.languages': 'Languages',
  'settings.tab.models': 'Models',
  'settings.tab.behavior': 'Behaviour',
  'settings.tab.about': 'About',

  'settings.vault.about':
    'A vault is an ordinary folder of markdown files. It is portable: copy it to a USB stick or an external drive and it keeps working there in full.',
  'settings.vault.reveal': 'Show in the file manager',
  'settings.vault.create': 'Create a new vault',
  'settings.vault.docs': 'Documents',
  'settings.vault.indexState': 'Index state',
  'settings.vault.indexReady': 'up to date',
  'settings.vault.indexBuilding': 'building',
  'settings.vault.indexMissing': 'no index',
  'settings.vault.indexAt': 'Last index run',
  'settings.vault.indexNever': 'never',
  'settings.vault.duration': 'Duration',
  'settings.vault.indexDuration': '{ms} ms',
  'settings.vault.rebuild': 'Rebuild the index',
  'settings.vault.rebuilding': 'Building the index',
  'settings.vault.rebuildProgress': '{done} of {total} files',
  'settings.vault.rebuildDone': 'Index rebuilt, {count} documents.',
  'settings.vault.indexNote':
    'The index is derived. It may be rebuilt at any time — nothing is lost in the process.',
  'settings.vault.recent': 'Recently opened',
  'settings.vault.recentMissing': 'not found',
  'settings.vault.recentOpen': 'Open the vault {name}',

  'settings.lang.title': 'Languages',
  'settings.lang.note':
    'Three settings that need not agree: the interface may be German while the notes are written in English.',
  'settings.lang.ui.label': 'Interface',
  'settings.lang.ui.hint':
    'Language of buttons, titles and messages. Takes effect at once, no restart.',
  'settings.lang.ui.example': 'Example: the screen is called “Capture” instead of “Erfassen”.',
  'settings.lang.documents.label': 'Document language',
  'settings.lang.documents.hint':
    'The language the model writes notes, wiki pages and summaries into the vault.',
  'settings.lang.documents.example': 'Example: a German transcript becomes an English source page.',
  'settings.lang.conversation.label': 'Conversation language',
  'settings.lang.conversation.hint':
    'The language the app answers in — when asking and in the journal.',
  'settings.lang.conversation.example': 'Example: you ask in German, the answer comes in English.',
  'settings.lang.translate.label': 'Translate foreign-language sources while distilling',
  'settings.lang.translate.hint':
    'A foreign source then becomes a page in the document language. Quotes stay in the original.',
  'settings.lang.de': 'Deutsch',
  'settings.lang.en': 'English',

  'settings.behavior.capture': 'Capturing',
  'settings.behavior.hotkey.label': 'Shortcut for quick capture',
  'settings.behavior.hotkey.hint':
    'Opens the small window whatever app is in front. If the combination is taken, the app says so and the old one stays.',
  'settings.behavior.hotkey.record': 'Record',
  'settings.behavior.hotkey.recording': 'Press the keys, Esc cancels',
  'settings.behavior.hotkey.reset': 'Reset',
  'settings.behavior.hotkey.none': 'none',
  'settings.behavior.autoClassify.label': 'Sort dumps after they are filed',
  'settings.behavior.autoClassify.hint':
    'The model makes a proposal. It is carried out only once you agree.',
  'settings.behavior.closeAfter.label': 'Close the quick capture window after filing',
  'settings.behavior.closeAfter.hint':
    'It stays up long enough to read the confirmation with path and undo. Switched off it stays open for the next thought.',
  'settings.behavior.overview': 'Overview and reminders',
  'settings.behavior.stale.label': 'A project counts as stalled after',
  'settings.behavior.stale.hint': 'Days without any trace — file, todo or session.',
  'settings.behavior.deadline.label': 'Show deadlines from',
  'settings.behavior.deadline.hint': 'Days ahead in which a deadline appears on the dashboard.',
  'settings.behavior.waiting.label': 'Nudge waiting-for without a date after',
  'settings.behavior.waiting.hint': 'Days after which an open waiting-for becomes visible.',
  'settings.behavior.days': 'days',
  'settings.behavior.claude.label': 'Read Claude Code sessions',
  'settings.behavior.claude.hint':
    'CLI work traces count as progress on the project whose repo lives there.',
  'settings.behavior.claude.dir.label': 'Folder of the Claude projects',
  'settings.behavior.claude.dir.hint': 'Leave empty for ~/.claude/projects.',
  'settings.behavior.notifications.label': 'Notifications for due reminders',
  'settings.behavior.notifications.hint': 'Reports deadlines even when the window is closed.',
  'settings.behavior.journal': 'Journal',
  'settings.behavior.coach.label': 'Attitude of the coach',
  'settings.behavior.coach.listen': 'Listen',
  'settings.behavior.coach.listen.hint': 'Mirror and acknowledge, no advice.',
  'settings.behavior.coach.tips': 'Give tips',
  'settings.behavior.coach.tips.hint': 'Listen, then make concrete suggestions.',
  'settings.behavior.coach.analyze': 'Analyse',
  'settings.behavior.coach.analyze.hint': 'Show patterns in the light of earlier entries.',
  'settings.behavior.coach.where':
    'This is the default. In the journal the attitude switches per round with Ctrl+1 to Ctrl+3.',
  'settings.behavior.gardener': 'Gardening',
  'settings.behavior.runOnOpen.label': 'Run the gardening pass when the vault opens',
  'settings.behavior.runOnOpen.hint':
    'Finds orphaned pages, broken links and dumps left lying around.',
  'settings.behavior.review.label': 'A page counts as stale after',
  'settings.behavior.review.hint':
    'Days since the last "reviewed" in the frontmatter. Gardening names the page, it does not change it.',
  'settings.behavior.gardenerLlm.label': 'Let a model interpret the findings',
  'settings.behavior.gardenerLlm.hint':
    'On top of the checks: contradictions between pages, near duplicates, terms without a page. Without a route the pass stays deterministic and costs nothing.',

  'settings.about.title': 'About this app',
  'settings.about.version': 'Version',
  'settings.about.electron': 'Electron',
  'settings.about.platform': 'Platform',
  'settings.about.userData': 'Settings and keys',
  'settings.about.demo': 'Running on a sample vault.',
  'settings.about.keys':
    'API keys live encrypted in keys.json in this folder — with the encryption of the operating system, bound to this user account. They are never in the vault, never in a log and never in an error message.',
  'settings.about.format.title': 'Vault format',
  'settings.about.format.body':
    'The binding file format is documented in docs/VAULT-FORMAT.md in the project folder: frontmatter, folder tree, wikilinks. What is not written there, the app does not write.',
  'settings.about.format.open': 'Open the vault README',
};

export const enSettings: Record<SettingsKey, string> = { ...own, ...enSettingsModels };
