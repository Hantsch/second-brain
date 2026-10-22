/* English texts for the settings: tabs, vault, languages, behaviour, about.
   The models tab lives in `en-settings-models.ts` and is merged in here, so
   `en.ts` needs a single import. Same key set as `de-settings.ts`. */

import type { SettingsKey } from './de-settings';
import { enSettingsModels } from './en-settings-models';

const own = {
  'settings.tab.languages': 'Languages',
  'settings.tab.models': 'Models',
  'settings.tab.behavior': 'Behaviour',
  'settings.tab.customization': 'Customization',
  'settings.tab.agent': 'Agent',
  'settings.tab.about': 'About',

  'settings.agent.cli.title': 'Claude Code',
  'settings.agent.cli.installed': 'Claude Code is installed.',
  'settings.agent.cli.foundAt': 'Found at',
  'settings.agent.cli.absent':
    "Claude Code was not found on this machine's PATH. Gaston does not install it.",
  'settings.agent.cli.guide': 'Open installation guide',
  'settings.agent.cli.unknown.timeout': 'Status unknown: the lookup timed out.',
  'settings.agent.cli.unknown.error': 'Status unknown: the lookup failed ({code}).',
  'settings.agent.cli.unknown.errorNoCode': 'Status unknown: the lookup failed.',
  'settings.agent.cli.note':
    'Gaston only looks for the CLI. It does not start it, so no version is shown.',
  'settings.agent.setup.title': 'Agent setup',
  'settings.agent.setup.intro':
    'Gaston writes these files so Claude Code knows the rules of this vault. Files it did not write are yours and stay untouched.',
  'settings.agent.setup.loading': 'Reading the setup files',
  'settings.agent.setup.error': 'The setup could not be read: {reason}',
  'settings.agent.setup.status.current': 'Current',
  'settings.agent.setup.status.outdated': 'Outdated',
  'settings.agent.setup.status.missing': 'Missing',
  'settings.agent.setup.status.modified': 'Changed by you',
  'settings.agent.setup.status.newer': 'From a newer Gaston',
  'settings.agent.setup.status.yours': 'Yours',
  'settings.agent.setup.install': 'Install',
  'settings.agent.setup.update': 'Update',
  'settings.agent.setup.current': 'Setup is current.',
  'settings.agent.setup.help.title': 'Help module',
  'settings.agent.setup.help.status.current': 'Current',
  'settings.agent.setup.help.status.outdated': 'Outdated',
  'settings.agent.setup.help.status.missing': 'Missing',
  'settings.agent.setup.help.status.collision': 'Blocked',
  'settings.agent.setup.help.collision':
    "A module named gaston-help that is not Gaston's blocks the help module. Renaming that module frees the name. Nothing was written.",
  'settings.agent.setup.plan.install': 'Install the agent setup',
  'settings.agent.setup.plan.update': 'Update the agent setup',
  'settings.agent.setup.plan.intro': 'Gaston writes only what is listed here, after you confirm.',
  'settings.agent.setup.plan.write': 'Will write',
  'settings.agent.setup.plan.optIn': 'Changed by you',
  'settings.agent.setup.plan.optInHint': 'Overwrite. A copy goes to the trash.',
  'settings.agent.setup.plan.leave': 'Left alone',
  'settings.agent.setup.plan.leaveManaged': 'Gaston does not write this file.',
  'settings.agent.setup.plan.dirs': 'Creates folders',
  'settings.agent.setup.plan.confirm': 'Write {count} files',
  'settings.agent.setup.plan.confirmOne': 'Write 1 file',
  'settings.agent.setup.plan.result.written': 'Setup written. {count} files.',
  'settings.agent.setup.plan.result.writtenOne': 'Setup written. 1 file.',
  'settings.agent.setup.plan.result.none': 'Nothing was written.',
  'settings.agent.setup.plan.result.conflict':
    'Changed on disk since the plan: {path}. Nothing written to it.',
  'settings.agent.setup.plan.result.refused': 'Not written: {path}.',
  'settings.agent.protection.title': 'Protection',
  'settings.agent.protection.loading': 'Reading the protection rules',
  'settings.agent.protection.none':
    'Nothing protects this vault from the agent yet. Install the setup above to add the rules.',
  'settings.agent.protection.unreadable':
    '.claude/settings.json could not be read: {reason}. The state of the rules is unknown.',
  'settings.agent.protection.status.installed': 'Installed',
  'settings.agent.protection.status.missing': 'Missing',
  'settings.agent.protection.rule.journal-read':
    "journal/ and its derived index cannot be read or changed by Claude's file tools.",
  'settings.agent.protection.rule.raw-write': 'raw/ is read-only.',
  'settings.agent.protection.rule.setup-write': 'CLAUDE.md and .claude/ are read-only.',
  'settings.agent.protection.rule.overview-write':
    'wiki/overview.md changes only through a proposal.',
  'settings.agent.protection.rule.internal-write':
    '{dir}/ is read-only except results, proposals and runs.',
  'settings.agent.protection.rule.pre-tool-guard':
    'A check before each tool call blocks shell access to journal/, shell writes to raw/, and writes outside the wiki layer.',
  'settings.agent.protection.rule.wiki-check':
    'Wiki writes are checked for frontmatter and a log.md entry.',
  'settings.agent.protection.extra': 'Rules you added',
  'settings.agent.protection.limit':
    'The shell check reads the command text. A path built from variables, or a script that opens files itself, is not caught.',
  'settings.agent.terminal.title': 'Terminal',
  'settings.agent.terminal.intro':
    'Opens a terminal with the vault as its working folder and Claude Code started.',
  'settings.agent.terminal.open': 'Open Claude in the vault',
  'settings.agent.terminal.jobs': 'Work the jobs',
  'settings.agent.terminal.curate': 'Curate a module',
  'settings.agent.terminal.module.label': 'Module to curate',
  'settings.agent.terminal.module.placeholder': 'Pick a module',
  'settings.agent.terminal.module.none': 'There is no module to curate yet.',
  'settings.agent.terminal.opened.windows-terminal': 'Opened in Windows Terminal.',
  'settings.agent.terminal.opened.powershell': 'Opened in PowerShell.',
  'settings.agent.terminal.reason.no-vault': 'No vault is open.',
  'settings.agent.terminal.reason.cli-absent':
    'Claude Code was not found on this machine, so no terminal is opened.',
  'settings.agent.terminal.reason.cli-unknown':
    'Whether Claude Code is installed is unknown, so no terminal is opened.',
  'settings.agent.terminal.reason.setup-missing':
    'Setup files are missing. Install the agent setup above first.',
  'settings.agent.terminal.reason.unsupported-platform':
    'Opening a terminal from Gaston is only supported on Windows.',
  'settings.agent.terminal.reason.invalid-module': 'That module does not exist in this vault.',
  'settings.agent.terminal.reason.no-terminal': 'No terminal could be started.',
  'settings.agent.terminal.reason.no-terminal.detail': 'No terminal could be started ({code}).',
  'settings.agent.terminal.error': 'The terminal request failed. Nothing was opened.',
  'settings.agent.about.title': 'About this',
  'settings.agent.about.open': 'Read the agent page in Knowledge',
  'settings.agent.about.unavailable': 'Install the help module above to read it here.',
  'settings.agent.about.body':
    'The agent is Claude Code, which you open yourself in a terminal with the vault as its working folder. It may curate the wiki layer of a module, write proposals for everything else, and work the jobs you hand to it. It never reads journal/, never writes raw/, and Gaston never starts it without a terminal.',

  'settings.customization.background.title': 'Background',
  'settings.customization.background.note':
    'The artwork stays centred and very subtle behind the content. Changes apply immediately.',
  'settings.customization.background.none': 'None',
  'settings.customization.background.none.preview': 'No image',
  'settings.customization.background.thought-catcher': 'Thought catcher',
  'settings.customization.background.knowledge-constellation': 'Knowledge constellation',
  'settings.customization.background.pocket-vault': 'Pocket vault',
  'settings.customization.background.thread-of-return': 'Thread of return',
  'settings.customization.background.knowledge-garden': 'Knowledge garden',
  'settings.customization.icon.title': 'App icon',
  'settings.customization.icon.note':
    'The cropped icon appears in the title bar and in the operating system.',
  'settings.customization.icon.knowledge-garden': 'Knowledge garden',
  'settings.customization.icon.neural-core': 'Neural core',
  'settings.customization.icon.circuit-cortex': 'Circuit cortex',
  'settings.customization.icon.brain-chip': 'Brain chip',
  'settings.customization.icon.vault-brain': 'Vault brain',

  'settings.customization.tray.title': 'Tray',
  'settings.customization.tray.closeToTray.label':
    'Keep running in the tray when the window closes',
  'settings.customization.tray.closeToTray.hint':
    'Closing the window leaves Gaston running in the tray — the hotkey, reminders and quick capture keep working.',
  'settings.customization.tray.startMinimized.label': 'Start in the tray',
  'settings.customization.tray.startMinimized.hint':
    'Gaston starts hidden in the tray instead of opening the window.',

  'settings.vault.about':
    'A vault is an ordinary folder of markdown files. It is portable: copy it to a USB stick or an external drive and it keeps working there in full.',
  'settings.vault.reveal': 'Show in the file manager',
  'settings.vault.create': 'Create a new vault',
  'settings.vault.docs': 'Documents',
  'settings.vault.indexState': 'Index state',
  'settings.vault.indexReady': 'up to date',
  'settings.vault.indexBuilding': 'building',
  'settings.vault.indexFailed': 'update failed — rebuild the index',
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

  'settings.lang.migration.title': 'Old-language headings',
  'settings.lang.migration.warningOne': '1 file still carries headings in {language}.',
  'settings.lang.migration.warning': '{count} files still carry headings in {language}.',
  'settings.lang.migration.action': 'Migrate headings',
  'settings.lang.migration.dialog.title': 'Migrate headings',
  'settings.lang.migration.dialog.intro':
    'Every affected file gets its section headings in the current document language. The rest of the content stays unchanged.',
  'settings.lang.migration.dialog.countOne': '1 file will be migrated.',
  'settings.lang.migration.dialog.count': '{count} files will be migrated.',
  'settings.lang.migration.dialog.confirm': 'Migrate now',
  'settings.lang.migration.result.noneMigrated': 'No file needed a change.',
  'settings.lang.migration.result.migratedOne': '1 file migrated.',
  'settings.lang.migration.result.migrated': '{count} files migrated.',
  'settings.lang.migration.result.conflictsOne':
    '1 file changed since the plan was made and was skipped.',
  'settings.lang.migration.result.conflicts':
    '{count} files changed since the plan was made and were skipped.',

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
  'settings.behavior.codex.label': 'Read Codex CLI sessions',
  'settings.behavior.codex.hint':
    'CLI work traces count as progress on the project whose repo lives there.',
  'settings.behavior.codex.dir.label': 'Folder of the Codex sessions',
  'settings.behavior.codex.dir.hint': 'Leave empty for ~/.codex/sessions.',
  'settings.behavior.notifications.label': 'Notifications for due reminders',
  'settings.behavior.notifications.hint': 'Reports deadlines even when the window is closed.',
  'settings.behavior.journal': 'Journal',
  'settings.behavior.coach.label': 'Attitude of the coach',
  'settings.behavior.coach.listen': 'Listen',
  'settings.behavior.coach.listen.hint': 'Mirror and acknowledge, no advice.',
  'settings.behavior.coach.tips': 'Give tips',
  'settings.behavior.coach.tips.hint': 'Listen, then make concrete suggestions.',
  'settings.behavior.coach.analyze': 'Analyse',
  'settings.behavior.coach.analyze.hint': 'Help understand and support, with real entries.',
  'settings.behavior.coach.where':
    'This is the default. In the journal the attitude switches per round with Ctrl+1 to Ctrl+3.',
  'settings.behavior.gardener': 'Care',
  'settings.behavior.runOnOpen.label': 'Check automatically when the vault opens',
  'settings.behavior.runOnOpen.hint':
    'Finds orphaned pages, broken links and dumps left lying around.',
  'settings.behavior.review.label': 'A page counts as stale after',
  'settings.behavior.review.hint':
    'Days since the last "reviewed" in the frontmatter. The check flags the page, it does not change it.',
  'settings.behavior.gardenerLlm.label': 'Let a model interpret the results',
  'settings.behavior.gardenerLlm.hint':
    'On top of the checks: contradictions between pages, near duplicates, terms without a page. Without a route the check stays deterministic and costs nothing.',

  'settings.about.title': 'About this app',
  'settings.about.app': 'App',
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
  'settings.about.notes.title': "What's new in {version}",
  'settings.about.notes.loading': 'Loading release notes …',
  'settings.about.notes.empty.title': 'No release notes for this version',
  'settings.about.notes.empty.body':
    'The changelog has no entry for this version. The full changelog is linked below.',
  'settings.about.links.project': 'Project page',
  'settings.about.links.changelog': 'Full changelog',
  'settings.about.updates.title': 'Updates',
  'settings.about.updates.status.idle': 'Not checked yet.',
  'settings.about.updates.status.checking': 'Checking for a new version …',
  'settings.about.updates.status.upToDate': 'Gaston is up to date.',
  'settings.about.updates.status.available': 'Version {version} is available.',
  'settings.about.updates.status.error': 'Check failed: {reason}',
  'settings.about.updates.status.disabled.unpackaged':
    'Update checks are off in this build: it is not a packaged release.',
  'settings.about.updates.status.disabled.demo':
    'Update checks are off in this build: it runs on a sample vault.',
  'settings.about.updates.error.network': 'The release server could not be reached.',
  'settings.about.updates.error.http': 'The release server answered with an error.',
  'settings.about.updates.error.feed': 'The release feed could not be read.',
  'settings.about.updates.error.timeout': 'The release server did not answer in time.',
  'settings.about.updates.error.unknown': 'Unknown error.',
  'settings.about.updates.lastChecked': 'Last checked',
  'settings.about.updates.distribution': 'Distribution',
  'settings.about.updates.distribution.installed': 'Installed',
  'settings.about.updates.distribution.portable': 'Portable build',
  'settings.about.updates.check': 'Check now',
  'settings.about.updates.checking': 'Checking …',
  'settings.about.update.never': 'Never checked',
  'settings.about.update.pending.title': 'Update waiting',
  'settings.about.update.pending.badge': 'Not yet installed',
};

export const enSettings: Record<SettingsKey, string> = { ...own, ...enSettingsModels };
