/* English texts for the local-runtime card — same key set as
   `de-settings-runtime.ts`, enforced by the type below. */

import type { SettingsRuntimeKey } from './de-settings-runtime';

export const enSettingsRuntime: Record<SettingsRuntimeKey, string> = {
  'settings.runtime.title': 'Local runtime (Ollama)',
  'settings.runtime.note':
    'Runs only on this machine. Nothing here sends anything before you confirm it.',
  'settings.runtime.recheck': 'Check again',
  'settings.runtime.status.running': 'Ollama is running on this machine.',
  'settings.runtime.status.installedStopped': 'Ollama is installed but not running right now.',
  'settings.runtime.status.absent': 'No local runtime is installed on this machine.',
  'settings.runtime.getIt': 'Get it',
  'settings.runtime.startIt': 'Start it',
  'settings.runtime.manualPath': 'Or install it yourself:',
  'settings.runtime.start.ok': 'Started — Ollama is now running.',
  'settings.runtime.start.failed.timeout':
    'Ollama did not answer in time. Try starting it yourself, then check again.',
  'settings.runtime.start.failed.spawn-failed':
    'Ollama could not be started on this machine. Try starting it yourself, then check again.',
  'settings.runtime.blocked.unsupported-platform':
    'The in-app install only covers Windows and macOS — on this platform, please install it yourself.',
  'settings.runtime.blocked.insufficient-disk':
    'Not enough free disk space for the installer — free up space, or install it yourself.',
  'settings.runtime.blocked.no-write-permission':
    'This app has no write permission for the download location — install it yourself instead.',

  'settings.runtime.dialog.title': 'Get the local runtime',
  'settings.runtime.dialog.intro': 'Before anything downloads:',
  'settings.runtime.dialog.size': 'Download size: {mb}',
  'settings.runtime.dialog.installerPath': 'The installer will be saved to: {path}',
  'settings.runtime.dialog.modelDir': 'Ollama will store models at: {path}',
  'settings.runtime.dialog.noUninstall':
    'This app cannot uninstall Ollama later — it stays on this machine even if Second brain is removed.',
  'settings.runtime.dialog.confirm': 'Download the installer',
  'settings.runtime.dialog.downloading': 'Downloading the installer…',
  'settings.runtime.dialog.progress': '{downloaded} of {total}',
  'settings.runtime.dialog.cancelDownload': 'Cancel the download',
  'settings.runtime.dialog.done': 'Download finished.',
  'settings.runtime.dialog.openInstaller': 'Open the installer',
  'settings.runtime.dialog.yourTurn':
    'The installer is open — click through it yourself, then come back here and press "Check again".',
  'settings.runtime.dialog.openFailed.no-installer-downloaded':
    'No installer has been downloaded yet.',

  'settings.runtime.pull.title': 'Models worth pulling',
  'settings.runtime.pull.note':
    'Only models this machine can actually carry — each with its download size.',
  'settings.runtime.pull.empty':
    "Nothing to pull right now — either everything that fits is already installed, or there's no recommendation yet.",
  'settings.runtime.pull.size': '{gb} GB',
  'settings.runtime.pull.start': 'Pull',
  'settings.runtime.pull.startAria': 'Pull {model}',
  'settings.runtime.pull.cancel': 'Cancel',
  'settings.runtime.pull.cancelAria': 'Cancel pulling {model}',
  'settings.runtime.pull.retry': 'Retry',
  'settings.runtime.pull.retryAria': 'Retry pulling {model}',
  'settings.runtime.pull.progress': '{completed} of {total}',
  'settings.runtime.pull.progressAria': 'Download progress for {model}',
  'settings.runtime.pull.done': 'Installed.',
  'settings.runtime.pull.failed': 'The pull failed.',
};
