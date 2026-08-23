/* English texts for the local-runtime card — same key set as
   `de-settings-runtime.ts`, enforced by the type below. */

import type { SettingsRuntimeKey } from './de-settings-runtime';

export const enSettingsRuntime: Record<SettingsRuntimeKey, string> = {
  'settings.runtime.title': 'Local runtime (Ollama)',
  'settings.runtime.title.llamacpp': 'Local runtime (llama.cpp)',
  'settings.runtime.note':
    'Runs only on this machine. Nothing here sends anything before you confirm it.',
  'settings.runtime.recheck': 'Check again',
  'settings.runtime.status.running': 'Ollama is running on this machine.',
  'settings.runtime.status.installedStopped': 'Ollama is installed but not running right now.',
  'settings.runtime.status.absent': 'No local runtime is installed on this machine.',
  'settings.runtime.status.running.llamacpp': 'llama.cpp is running on this machine.',
  'settings.runtime.status.installedStopped.llamacpp':
    'llama.cpp is installed but not running right now.',
  'settings.runtime.getIt': 'Get it',
  'settings.runtime.startIt': 'Start it',
  'settings.runtime.manualPath': 'Or install it yourself:',
  'settings.runtime.start.ok': 'Started — Ollama is now running.',
  'settings.runtime.start.failed.timeout':
    'Ollama did not answer in time. Try starting it yourself, then check again.',
  'settings.runtime.start.failed.spawn-failed':
    'Ollama could not be started on this machine. Try starting it yourself, then check again.',
  'settings.runtime.start.ok.llamacpp': 'Started — llama.cpp is now running.',
  'settings.runtime.start.failed.timeout.llamacpp':
    'llama.cpp did not answer in time. Try starting it yourself, then check again.',
  'settings.runtime.start.failed.spawn-failed.llamacpp':
    'llama.cpp could not be started on this machine. Try starting it yourself, then check again.',
  'settings.runtime.blocked.unsupported-platform':
    'The in-app install only covers Windows and macOS — on this platform, please install it yourself.',
  'settings.runtime.blocked.insufficient-disk':
    'Not enough free disk space for the installer — free up space, or install it yourself.',
  'settings.runtime.blocked.no-write-permission':
    'This app has no write permission for the download location — install it yourself instead.',
  'settings.runtime.blocked.unsupported-platform.llamacpp':
    'No llama.cpp build is available for this platform or processor.',
  'settings.runtime.blocked.insufficient-disk.llamacpp':
    'Not enough free disk space for the engine — free up space, then try again.',
  'settings.runtime.blocked.no-write-permission.llamacpp':
    'This app has no write permission for the download location.',

  'settings.runtime.dialog.title': 'Get the local runtime',
  'settings.runtime.dialog.intro': 'Before anything downloads:',
  'settings.runtime.dialog.size': 'Download size: {mb}',
  'settings.runtime.dialog.installerPath': 'The installer will be saved to: {path}',
  'settings.runtime.dialog.modelDir': 'Ollama will store models at: {path}',
  'settings.runtime.dialog.noUninstall':
    'This app cannot uninstall Ollama later — it stays on this machine even if Gaston is removed.',
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

  'settings.runtime.dialog.installerPath.llamacpp': 'The engine will be installed at: {path}',
  'settings.runtime.dialog.modelDir.llamacpp': 'Model files go under: {path}',
  'settings.runtime.dialog.noUninstall.llamacpp':
    'This app manages the engine itself in that folder — removing Gaston removes it too.',
  'settings.runtime.dialog.confirm.llamacpp': 'Download the engine',
  'settings.runtime.dialog.downloading.llamacpp': 'Downloading the engine…',
  'settings.runtime.dialog.openInstaller.llamacpp': 'Open the engine folder',
  'settings.runtime.dialog.yourTurn.llamacpp':
    'The engine folder is open — there is nothing else to do here.',

  'settings.runtime.dialog.build.label': 'Build',
  'settings.runtime.dialog.build.option.cuda': 'CUDA (NVIDIA GPU)',
  'settings.runtime.dialog.build.option.vulkan': 'Vulkan (GPU, any vendor)',
  'settings.runtime.dialog.build.option.cpu': 'CPU only',
  'settings.runtime.dialog.build.option.macos': 'Apple Silicon (Metal)',

  /* The structured reason (033, D2) becomes a sentence here — core hands over
     facts only, never composed English (CLAUDE.md guardrail 7). */
  'settings.runtime.dialog.build.reason.noGpu':
    'No GPU detected — using the CPU build, which needs no driver.',
  'settings.runtime.dialog.build.reason.macos':
    'macOS: a single universal build backed by Metal, no vendor branching needed.',
  'settings.runtime.dialog.build.reason.gpuDetected':
    '"{gpuName}" detected — using the {build} build.',
  'settings.runtime.dialog.build.reason.gpuUnsure':
    '"{gpuName}" reported, but the scan could not confirm it — using the {build} build.',
  'settings.runtime.dialog.build.reason.fallback':
    '"{gpuName}" detected — the {requested} build has no asset for this platform, falling back to the {actual} build.',
  'settings.runtime.dialog.build.reason.fallbackUnsure':
    '"{gpuName}" reported, but the scan could not confirm it — the {requested} build has no asset for this platform, falling back to the {actual} build.',

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

  'settings.runtime.model.title': 'Models for llama.cpp',
  'settings.runtime.model.note':
    'Searches public GGUF repositories on Hugging Face — no sign-in, no token.',
  'settings.runtime.model.searchLabel': 'Model search',
  'settings.runtime.model.searchPlaceholder': 'e.g. qwen2.5 1.5b gguf',
  'settings.runtime.model.searchButton': 'Search',
  'settings.runtime.model.searchEmpty': 'No matching models found.',
  'settings.runtime.model.filesFor': 'Files in {repo}',
  'settings.runtime.model.loadingFiles': 'Loading files…',
  'settings.runtime.model.filesEmpty': 'This repository has no GGUF file.',
  'settings.runtime.model.sizeUnknown': 'Size unknown',
  'settings.runtime.model.quantUnknown': 'Quantisation unknown',
  'settings.runtime.model.reason.gated': 'This repository needs access on huggingface.co.',
  'settings.runtime.model.reason.network-error': 'Could not reach Hugging Face.',
  'settings.runtime.model.reason.error': 'Hugging Face responded with an error.',
  'settings.runtime.model.diskRefused': 'Not enough free disk space — only {mb} MB free.',
};
