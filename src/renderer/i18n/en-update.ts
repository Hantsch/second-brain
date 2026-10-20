/* English UI texts for the title-bar update control. Same key set as
   `de-update.ts` — enforced by tests/renderer/i18n.test.ts. */

import type { deUpdate } from './de-update';

export const enUpdate: Record<keyof typeof deUpdate, string> = {
  'update.control': 'Update {version}',
  'update.control.aria': 'Update to version {version} available',
  'update.dialog.title': 'Update {version}',
  'update.dialog.body': 'A newer version of Gaston is available.',
  'update.dialog.whatChanged': 'What changed',
  'update.dialog.notNow': 'Not now',
  'update.dialog.close': 'Close',

  'update.action.download': 'Download update',
  'update.action.openRelease': 'Open release page',
  'update.action.cancel': 'Cancel',
  'update.action.install': 'Restart and install',
  'update.action.downloading': 'Downloading update',

  'update.error.notInstallable': 'This build cannot update itself. Open the release page instead.',
  'update.error.notAvailable': 'No update is available.',
  'update.error.notReady': 'The update has not finished downloading yet.',
  'update.error.taskRunning': 'A task is still running. Wait for it to finish, or stop it.',
  'update.error.llmStreaming': 'A reply is being generated. Wait for it to finish.',
  'update.error.installFailed': 'The installation could not be started.',
  'update.error.download.offline': 'The download failed: no connection.',
  'update.error.download.checksum': 'The download was discarded: the checksum does not match.',
  'update.error.download.cancelled': 'The download was cancelled.',
  'update.error.download.unknown': 'The download failed.',
};
