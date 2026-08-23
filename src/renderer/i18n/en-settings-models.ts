/* English texts for the models tab — same key set as `de-settings-models.ts`,
   enforced by the type in `en-settings.ts`. */

import type { SettingsModelsKey } from './de-settings-models';
import { enSettingsRuntime } from './en-settings-runtime';

const own = {
  'settings.models.start.title': 'No model set up yet',
  'settings.models.start.body':
    'Three ways are open, and you can switch at any time. Without a model the app stays usable.',
  'settings.models.start.local.title': 'Local (Ollama)',
  'settings.models.start.local.body': 'Runs on this machine, nothing leaves the device, no cost.',
  'settings.models.start.cloud.title': 'API key (Anthropic, OpenAI, OpenRouter)',
  'settings.models.start.cloud.body':
    'Strong, costs per request. The key stays encrypted on this machine.',
  'settings.models.start.none.title': 'Carry on without a model',
  'settings.models.start.none.body':
    'Capturing, searching, projects and todos work without any model.',
  'settings.models.start.none.action': 'Go to the dashboard',

  'settings.detect.title': 'Is a model already running here?',
  'settings.detect.checking': 'Looking on this machine',
  'settings.detect.found':
    '{label} runs on this machine, {count} models found. Take it as the local provider?',
  'settings.detect.foundOne':
    '{label} runs on this machine, one model found. Take it as the local provider?',
  'settings.detect.foundEmpty':
    '{label} answers on this machine but has no model loaded. Load a model first, then take it.',
  'settings.detect.configured': '{label} is already set up as a provider.',
  'settings.detect.adopt': 'Take it as a provider',
  'settings.detect.none': 'No local model found.',
  'settings.detect.runtimeCardHint':
    'Guided setup, including the download and its progress, is further below under "Local runtime".',
  'settings.detect.goToRuntimeCard': 'Go to the "Local runtime" card',
  'settings.detect.guideLink': 'Open ollama.com',
  'settings.detect.recheck': 'Look again',
  'settings.detect.failed': 'The search failed.',

  'settings.providers.title': 'Providers',
  'settings.providers.count': '{count} providers',
  'settings.providers.countOne': 'one provider',
  'settings.providers.empty':
    'No provider set up yet. As soon as one is, it appears here as a card with connection test and model list.',
  'settings.providers.add': 'Add a provider',
  'settings.providers.note':
    'The provider list travels with the vault. The keys stay encrypted on this machine.',

  'provider.kind.anthropic': 'Anthropic Messages',
  'provider.kind.openai-compatible': 'OpenAI-compatible',
  'provider.kind.fake': 'Test responder',
  'provider.local': 'Local',
  'provider.remote': 'Cloud',
  'provider.models': '{count} models',
  'provider.modelsOne': 'one model',
  'provider.noModels': 'no models loaded yet',
  'provider.probeOk': 'Connection held, {ms} ms',
  'provider.probeFailed': 'Connection failed',
  'provider.probeNever': 'not tested yet',
  'provider.probeAt': 'last {when}',
  'provider.needsKey': 'Key missing',
  'provider.disabled': 'Switched off',
  'provider.probe': 'Test the connection',
  'provider.loadModels': 'Load models',
  'provider.modelsLoaded': '{count} models loaded.',
  'provider.edit': 'Edit',
  'provider.remove': 'Remove',
  'provider.removeAsk': 'Remove this provider? Tasks pointing at it lose their model.',
  'provider.removeConfirm': 'Yes, remove it',
  'provider.enable': 'Switch on',
  'provider.disable': 'Switch off',

  'provider.dialog.addTitle': 'Add a provider',
  'provider.dialog.editTitle': 'Edit the provider',
  'provider.dialog.presetLead': 'What should we talk to?',
  'provider.dialog.labelLabel': 'Name',
  'provider.dialog.labelHint': 'For you only — it shows up in the model picker.',
  'provider.dialog.baseUrlLabel': 'Address',
  'provider.dialog.baseUrlHint': 'The API endpoint, for example http://localhost:11434/v1.',
  'provider.dialog.keyLabel': 'API key',
  'provider.dialog.keyHint': 'Stored encrypted on this machine, never in the vault.',
  'provider.dialog.keyKeep': 'Leaving it empty keeps the stored key.',
  'provider.dialog.localLabel': 'Runs on this machine',
  'provider.dialog.localHint': 'Local providers are recommended for personal tasks.',
  'provider.dialog.save': 'Save and test',
  'provider.dialog.testing': 'Testing the connection',
  'provider.dialog.back': 'Another template',

  'settings.routing.title': 'Task routing',
  'settings.routing.summary': '{routed} of {total} tasks have a model.',
  'settings.routing.withoutRow': 'Without a model: {fallback}',
  'settings.routing.callToAction':
    'A provider with models is set up. “Assign automatically” proposes a model for every task; nothing is saved until you agree.',
  'settings.routing.allRouted': 'Every task has a model.',
  'settings.routing.empty':
    'As soon as a provider has models, every task can be assigned one here.',
  'settings.routing.col.task': 'Task',
  'settings.routing.col.suggestion': 'Recommendation',
  'settings.routing.col.model': 'Provider and model',
  'settings.routing.col.test': 'Test',
  'settings.routing.sensitive': 'Reads personal content — a local model is recommended.',
  'settings.routing.sensitiveShort': 'Personal',
  'settings.routing.inherit': 'Default: {model}',
  'settings.routing.noModel': 'no model',
  'settings.routing.selectAria': 'Model for {task}',
  'settings.routing.note': 'Tasks without a choice of their own take their class default.',
  'settings.routing.test': 'Test',
  'settings.routing.testOk': 'Answer after {ms} ms',
  'settings.routing.testFailed': 'No result',
  'settings.routing.reason.no-route': 'No model is assigned to this task.',
  'settings.routing.reason.provider-disabled': 'The assigned provider is switched off.',
  'settings.routing.reason.no-key': 'The key for the assigned provider is missing.',
  'settings.routing.reason.unreachable': 'The assigned provider was not reachable.',
  'settings.routing.reason.no-vault': 'No vault is open.',
  'settings.routing.reason.error': 'The call failed.',

  'settings.routing.defaults': 'Default per performance class',
  'settings.routing.defaultsNote':
    'These three apply to every task without a choice of its own — the fallback chain.',
  'settings.routing.defaultAria': 'Default model for the {tier} class',
  'settings.routing.auto': 'Assign automatically',
  'settings.routing.autoHint':
    'Looks for a fitting model for every task among the ones you set up.',
  'settings.routing.preview.title': 'Proposal',
  'settings.routing.preview.lead':
    '{count} assignments would change. Nothing is saved until you agree.',
  'settings.routing.preview.leadOne':
    'One assignment would change. Nothing is saved until you agree.',
  'settings.routing.preview.none': 'The proposal matches what is already set.',
  'settings.routing.preview.apply': 'Take it over',
  'settings.routing.preview.discard': 'Discard',
  'settings.routing.preview.tier': '{tier} default',
  'settings.routing.preview.arrow': 'becomes',

  'settings.tier.cheap': 'Small',
  'settings.tier.balanced': 'Medium',
  'settings.tier.strong': 'Large',
  'settings.tier.cheap.why': 'Short input and output — a large model would be waste.',
  'settings.tier.balanced.why': 'Needs care with context, but no top-end model.',
  'settings.tier.strong.why': 'Changes what you have and needs judgement.',

  'settings.fallback.title-tags': 'the title comes from the first line',
  'settings.fallback.classify-dump': 'the dump stays in the inbox',
  'settings.fallback.extract-tasks': 'checkboxes in the text are still found',
  'settings.fallback.query-answer': 'full-text search shows the passages',
  'settings.fallback.query-rerank': 'hits keep the order of the search',
  'settings.fallback.summarize-source': 'the source stays under raw/',
  'settings.fallback.wiki-ingest': 'pages stay as they are',
  'settings.fallback.journal-chat': 'the day entry can still be written',
  'settings.fallback.journal-loose-ends': 'loose ends stay unnoticed',
  'settings.fallback.project-status': 'status and next step stay handwork',
  'settings.fallback.gardener-audit': 'the deterministic checks keep running',

  'settings.machine.title': 'This machine',
  'settings.machine.scan': 'Scan this machine',
  'settings.machine.rescan': 'Scan again',
  'settings.machine.scannedAt': 'Last scanned: {when}',
  'settings.machine.group.facts': 'What this machine is',
  'settings.machine.group.capacity': 'What it can carry',
  'settings.machine.group.editable': 'What you may change',
  'settings.machine.idle':
    'No scan has run yet. It reads RAM, graphics memory, CPU cores and free disk space — nothing is sent or stored.',
  'settings.machine.disclaimer':
    'A rule of thumb, not a measurement: actual throughput depends on the model, its quantization, and the runtime.',
  'settings.machine.unknown': 'unknown',
  'settings.machine.unknowns': "Couldn't be determined: {list}.",
  'settings.machine.verdict.unknown': "Can't be judged — too many facts are missing.",
  'settings.machine.resource.ram': 'RAM',
  'settings.machine.resource.vram': 'Graphics memory (VRAM)',
  'settings.machine.resource.cpu': 'The number of CPU cores',
  'settings.machine.verdict.band.none':
    '{resource} is the ceiling: no local model fits comfortably on this machine right now.',
  'settings.machine.verdict.band.small':
    '{resource} is the ceiling: this machine comfortably carries small local models, for example quick chat-style helpers.',
  'settings.machine.verdict.band.medium':
    '{resource} is the ceiling: this machine comfortably carries medium-sized local models, with more context and better answers.',
  'settings.machine.verdict.band.large':
    '{resource} is the ceiling: this machine comfortably carries large local models too.',
  'settings.machine.fact.ram': 'RAM',
  'settings.machine.fact.vram': 'Graphics memory (VRAM)',
  'settings.machine.fact.gpu': 'GPU',
  'settings.machine.fact.cpu': 'CPU cores',
  'settings.machine.fact.disk': 'Free disk space',
  'settings.machine.vram.unitGb': 'GB',
  'settings.machine.vram.enter': 'Enter it',
  'settings.machine.vram.manual': 'Entered by you',
  'settings.machine.vram.clear': 'Clear',
  'settings.machine.vram.error.empty': 'Enter a number.',
  'settings.machine.vram.error.not-a-number': 'Enter a number of GB.',
  'settings.machine.vram.error.not-positive': 'Enter at least {min} GB.',
  'settings.machine.vram.error.too-large': 'Enter at most {max} GB.',
  'settings.machine.vram.conflict':
    'Detection now reports {detected}, which disagrees with the {manual} you entered.',
  'settings.machine.vram.conflict.keepMine': 'Keep mine',
  'settings.machine.vram.conflict.useDetected': 'Use the detected value',
  'settings.machine.budget.title': 'Resource budget',
  'settings.machine.budget.value': '{percent} %',
  'settings.machine.budget.help':
    'Sizes model recommendations against this share of RAM and VRAM, after the fixed reserve. It does not limit a model that is already running.',
  'settings.machine.budget.aria': 'Share of RAM and VRAM available for local models',
  'settings.machine.budget.planned': 'planning with {planned} at {percent} % after reserve',

  'settings.recommend.title': 'Model recommendation',
  'settings.recommend.action': 'Get recommendations',
  'settings.recommend.note':
    'One suggestion per task, from the catalogue of models you can reach — nothing is taken over until you agree.',
  'settings.recommend.idle':
    'No recommendation fetched yet. It proposes a reachable model for every task, with a reason and a cost.',
  'settings.recommend.stale':
    'Prices may be out of date — they come from the bundled catalogue, dated {date}.',
  'settings.recommend.acceptAll': 'Accept all',
  'settings.recommend.discard': 'Discard',
  'settings.recommend.accept': 'Accept',
  'settings.recommend.accepted': 'Accepted',
  'settings.recommend.acceptAria': 'Accept the recommendation for {task}',
  'settings.recommend.needsDownload': '{model} — needs a download of {gb} GB',
  'settings.recommend.notYetSetUp': 'Set up a matching provider to accept this one.',
  'settings.recommend.costEstimate': '~{cost} per run (estimate)',
  'settings.recommend.policy': 'Policy read from {source}, dated {date}.',
  'settings.recommend.reason.best-fit-for-task': "Fits this task's typical size and cost.",
  'settings.recommend.reason.cheapest-reachable':
    "The matching size wasn't reachable — this is the cheapest reachable alternative.",
  'settings.recommend.reason.only-local-option':
    'Only a local model is reachable for this task, with nothing to compare it against.',
  'settings.recommend.reason.no-reachable-model':
    'No model you can currently reach fits this task.',
  'settings.recommend.reason.sensitive-rule-no-qualifying-target':
    'This task reads personal content, and no reachable model meets the rule for it — the task stays without a model.',
  'settings.recommend.tradeoff.cheaper-alternative-available':
    'A cheaper or local alternative exists: {alternatives}.',
};

export const enSettingsModels: Record<SettingsModelsKey, string> = {
  ...own,
  ...enSettingsRuntime,
};
