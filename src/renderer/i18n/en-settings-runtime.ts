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

  /* 034, D3: the widened `llm:startLocalRuntime` failure reasons, llama.cpp
     only — Ollama's implementation never reports these four. */
  'settings.runtime.start.failed.port-in-use.llamacpp':
    'Every port from 11435 to 11444 is already taken. Close whatever else is using them, then try again.',
  'settings.runtime.start.failed.model-missing.llamacpp':
    'No model file is installed yet. Get one first, then start the engine.',
  'settings.runtime.start.failed.binary-missing.llamacpp':
    'The engine itself is not installed yet. Get it before starting.',
  'settings.runtime.start.failed.out-of-memory.llamacpp':
    'Starting ran out of memory. Lower the resource budget or the context, then try again.',

  /* 034, D4: `LlamaEngineDetails` — the derived start plan, its warnings, and
     the stop/foreign-engine copy. `reason` codes come from `llama-args.ts`
     (see its header comment for the vocabulary); the values here compose the
     sentence for each. */
  'settings.runtime.plan.gpuLayers.vram-fit':
    '{n} of {total} layers run on the GPU — the rest runs on the CPU.',
  'settings.runtime.plan.gpuLayers.no-vram':
    'No layer runs on the GPU — no VRAM was planned for on this machine.',
  'settings.runtime.plan.gpuLayers.unknown-size':
    'No layer runs on the GPU — the model file size could not be used to size the offload.',
  'settings.runtime.plan.gpuLayers.manual': '{n} of {total} layers on the GPU — set by hand.',
  'settings.runtime.plan.estimatedNote':
    'The layer count is estimated from the model size, not read from the file.',
  'settings.runtime.plan.context.fits':
    'Context: {tokens} tokens — the largest size that still fits the planned memory.',
  'settings.runtime.plan.context.floor':
    'Context: {tokens} tokens — the smallest size the engine still starts at; nothing larger fit.',
  'settings.runtime.plan.context.manual': 'Context: {tokens} tokens — set by hand.',
  'settings.runtime.plan.threads.budget':
    '{n} of {cores} CPU threads — matches the resource budget.',
  'settings.runtime.plan.threads.default':
    '{n} threads — the core count could not be determined, so a default was used.',
  'settings.runtime.plan.warning.cpu-only':
    'This model runs entirely on the CPU — no layer is offloaded to a GPU.',
  'settings.runtime.plan.warning.slow-floor-context':
    'Runs on the CPU with a 2048-token context — answers will take minutes on this machine.',
  'settings.runtime.plan.warning.facts-unknown':
    'Some machine facts are unknown, so this plan may not match the machine exactly.',
  /* 034, D6: the auto-start toggle — `machine.llamaAutoStart`, default
     'manual'. */
  'settings.runtime.autoStart.label': 'Start automatically when a task needs it',
  'settings.runtime.autoStart.note':
    'Off by default — the engine only starts when you press "start it".',
  'settings.runtime.advanced.summary': 'Advanced',
  /* 034, D5: the two hand-entered start-plan overrides behind the
     "advanced" disclosure — machine-local like the VRAM override and the
     resource budget, never written into the vault. */
  'settings.runtime.advanced.gpuLayers.label': 'GPU layers',
  'settings.runtime.advanced.contextTokens.label': 'Context tokens',
  'settings.runtime.advanced.clear': 'Clear',
  'settings.runtime.advanced.error.empty': 'Enter a number.',
  'settings.runtime.advanced.error.not-a-number': 'Enter a whole number.',
  'settings.runtime.advanced.error.negative': 'Enter 0 or more.',
  'settings.runtime.stop': 'Stop it',
  'settings.runtime.stop.note': 'Stopping cancels any request in progress.',
  'settings.runtime.foreignEngine':
    'This app did not start this engine, so it cannot be stopped from here.',

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
