import { readdir, rm, symlink } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CONDENSE_REFUSALS,
  HandOverError,
  handOverSource,
  type CondenseRefusalCode,
} from '@core/agent/condense-source-job';
import { createAgentJobFiles } from '@core/agent/job-files';
import { settleAgentJobs, type AgentJobDeps } from '@core/agent/settle-jobs';
import { sha256 } from '@core/vault/hash';
import { VaultConflictError } from '@core/vault/types';
import { AGENT_DIRS } from '@shared/types';
import { createTempVault, type TempVault } from '../../helpers/vault';

const CLOCK = new Date('2026-10-27T09:00:00.000Z');
const MODULE = 'identity-management';
const RAW = 'raw/web/2026-08-06-digital-gardening-ueberblick.md';
const PROTOCOL = 'raw/web/2026-08-06-digital-gardening-ueberblick.ingest.json';
const SLUG = 's-2026-10-27-digital-gardening';
const PAGE = `modules/${MODULE}/wiki/sources/${SLUG}.md`;
const INDEX = `modules/${MODULE}/wiki/index.md`;
const LOG = `modules/${MODULE}/wiki/log.md`;

let vault: TempVault;
let deps: AgentJobDeps;

function pageText(fields: Record<string, string> = {}): string {
  const fm = { type: 'source', title: 'Digital gardening', module: MODULE, raw: RAW, ...fields };
  const lines = Object.entries(fm).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return ['---', ...lines, '---', '', 'Digital gardens grow notes slowly and in public.', ''].join(
    '\n',
  );
}

async function writeResult(id: string, fields: Record<string, string>): Promise<void> {
  const lines = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  await vault.write(`${AGENT_DIRS.results}/${id}.md`, ['---', ...lines, '---', ''].join('\n'));
}

async function handOver(module: string | null = MODULE) {
  return (await handOverSource(deps, { rawPath: RAW, module, language: 'en' })).job;
}

async function bookkeeping() {
  return {
    index: await vault.read(INDEX),
    log: await vault.read(LOG),
    protocol: await vault.read(PROTOCOL),
  };
}

async function finishedJob(id: string) {
  return (await deps.jobs.finished()).find((entry) => entry.job.id === id);
}

beforeEach(async () => {
  vault = await createTempVault({
    sample: true,
    files: { 'modules/other/module.md': '---\ntitle: Other\n---\n' },
  });
  deps = {
    vaultRoot: vault.root,
    store: vault.store,
    jobs: createAgentJobFiles(vault.root, () => CLOCK),
    now: () => CLOCK,
    docLanguage: 'en',
  };
});

afterEach(async () => {
  await vault.cleanup();
});

describe('handing a waiting source to the agent', () => {
  it('handing over a waiting source files one job naming raw path, module and ingest hash', async () => {
    const first = await handOverSource(deps, { rawPath: RAW, module: MODULE, language: 'en' });
    const again = await handOverSource(deps, { rawPath: RAW, module: MODULE, language: 'en' });

    expect(first.status).toBe('filed');
    expect(again).toMatchObject({ status: 'exists', job: { id: first.job.id } });
    const open = await deps.jobs.open();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      kind: 'condense-source',
      subject: RAW,
      fields: {
        raw: RAW,
        module: MODULE,
        language: 'en',
        title: 'Digital Gardening: ein Überblick',
        ingestHash: sha256((await vault.read(PROTOCOL)) ?? ''),
      },
    });
    const written = (await vault.read(`${AGENT_DIRS.jobs}/${first.job.id}.md`)) ?? '';
    expect(written).toContain(`raw: ${RAW}`);
    // Paths only: nothing of the source's own text travels in the job.
    const rawText = (await vault.read(RAW)) ?? '';
    const sourceLine = rawText.split('\n').find((line) => line.trim().length > 40) ?? '';
    expect(sourceLine.length).toBeGreaterThan(0);
    expect(written).not.toContain(sourceLine.trim());
  });

  it('a condensed source cannot be handed over', async () => {
    const protocol = JSON.parse((await vault.read(PROTOCOL)) ?? '{}') as Record<string, unknown>;
    await vault.write(PROTOCOL, JSON.stringify({ ...protocol, sourcePage: 's-earlier' }));

    await expect(handOver()).rejects.toMatchObject({ code: 'already-condensed' });
    await expect(
      handOverSource(deps, { rawPath: 'raw/web/nothing.md', module: MODULE, language: 'en' }),
    ).rejects.toBeInstanceOf(HandOverError);
    expect(await deps.jobs.open()).toEqual([]);
  });
});

describe('handing over a source the app could not mark as condensed', () => {
  it('a source without a readable ingest protocol cannot be handed over', async () => {
    await rm(vault.absolute(PROTOCOL));
    await expect(handOver()).rejects.toMatchObject({ code: 'not-a-source' });

    await vault.write(PROTOCOL, '[1, 2]');
    await expect(handOver()).rejects.toMatchObject({ code: 'not-a-source' });

    expect(await deps.jobs.open()).toEqual([]);
  });

  it('a module named in prose is handed over and settled under its folder slug', async () => {
    await vault.write('modules/cooking/module.md', '---\ntitle: Cooking\n---\n');
    const cookingPage = `modules/cooking/wiki/sources/${SLUG}.md`;
    const job = await handOver('Cooking');
    await vault.write(cookingPage, pageText({ module: 'cooking' }));
    await writeResult(job.id, { status: 'done', sourcePage: cookingPage });

    await settleAgentJobs(deps);

    expect(job.fields['module']).toBe('cooking');
    expect(job.body).toContain('modules/cooking/wiki');
    expect(job.body).not.toContain('Cooking');
    expect(await finishedJob(job.id)).toMatchObject({ outcome: 'done', reason: null });
    expect(JSON.parse((await vault.read(PROTOCOL)) ?? '{}')).toMatchObject({
      sourcePage: SLUG,
      modules: ['cooking'],
    });
  });
});

describe('settling a condense-source result', () => {
  it('a valid result books sourcePage and modules and fills a missing index and log entry', async () => {
    const job = await handOver();
    await vault.write(PAGE, pageText());
    await writeResult(job.id, { status: 'done', sourcePage: PAGE });

    expect(await settleAgentJobs(deps)).toBe(true);

    const protocol = JSON.parse((await vault.read(PROTOCOL)) ?? '{}') as Record<string, unknown>;
    expect(protocol).toMatchObject({ sourcePage: SLUG, modules: [MODULE], kind: 'url' });
    expect(await vault.read(INDEX)).toContain(`- [[${SLUG}]] — Digital gardens grow notes`);
    expect(await vault.read(LOG)).toContain(`ingest | Digital gardening\n- summary: ${PAGE}`);
    expect(await finishedJob(job.id)).toMatchObject({ outcome: 'done', reason: null });
    expect(await deps.jobs.open()).toEqual([]);
  });

  it('index and log entries the agent wrote itself are not added a second time', async () => {
    const job = await handOver();
    await vault.write(PAGE, pageText());
    const index = `${(await vault.read(INDEX)) ?? ''}\n- [[${SLUG}]] — Written by the agent\n`;
    const log = `${(await vault.read(LOG)) ?? ''}\n## [2026-10-27] ingest | Digital gardening\n- summary: wiki/sources/${SLUG}.md\n`;
    await vault.write(INDEX, index);
    await vault.write(LOG, log);
    await writeResult(job.id, { status: 'done', sourcePage: PAGE });

    await settleAgentJobs(deps);

    expect(await vault.read(INDEX)).toBe(index);
    expect(await vault.read(LOG)).toBe(log);
    expect(await finishedJob(job.id)).toMatchObject({ outcome: 'done' });
  });

  const refusals: {
    name: string;
    module?: string | null;
    code: CondenseRefusalCode;
    arrange: (id: string) => Promise<Record<string, string>>;
  }[] = [
    {
      name: 'the named page does not exist',
      code: 'page-missing',
      arrange: async () => ({ status: 'done', sourcePage: PAGE }),
    },
    {
      name: 'the result names no page',
      code: 'page-missing',
      arrange: async () => ({ status: 'done' }),
    },
    {
      name: 'the page is no source page',
      code: 'invalid-frontmatter',
      arrange: async () => {
        await vault.write(PAGE, pageText({ type: 'concept' }));
        return { status: 'done', sourcePage: PAGE };
      },
    },
    {
      name: 'the page points at another raw source',
      code: 'invalid-frontmatter',
      arrange: async () => {
        await vault.write(PAGE, pageText({ raw: 'raw/web/other.md' }));
        return { status: 'done', sourcePage: PAGE };
      },
    },
    {
      name: 'the path climbs out with ../',
      code: 'outside-module-wiki',
      arrange: async () => {
        await vault.write(`modules/${MODULE}/wiki/${SLUG}.md`, pageText());
        return { status: 'done', sourcePage: `modules/${MODULE}/wiki/sources/../${SLUG}.md` };
      },
    },
    {
      name: 'the page lies in another module',
      code: 'outside-module-wiki',
      arrange: async () => {
        await vault.write(`modules/other/wiki/sources/${SLUG}.md`, pageText({ module: 'other' }));
        return { status: 'done', sourcePage: `modules/other/wiki/sources/${SLUG}.md` };
      },
    },
    {
      name: 'the path is absolute',
      code: 'outside-module-wiki',
      arrange: async () => {
        await vault.write(PAGE, pageText());
        return { status: 'done', sourcePage: vault.absolute(PAGE).replace(/\\/g, '/') };
      },
    },
    {
      name: 'the path uses backslashes',
      code: 'outside-module-wiki',
      arrange: async () => {
        await vault.write(PAGE, pageText());
        return { status: 'done', sourcePage: PAGE.replace(/\//g, '\\') };
      },
    },
    {
      name: 'the module folder is a link to another module',
      module: null,
      code: 'outside-module-wiki',
      arrange: async () => {
        await vault.write(`modules/other/wiki/sources/${SLUG}.md`, pageText());
        await symlink(
          vault.absolute('modules/other'),
          vault.absolute('modules/linked'),
          'junction',
        );
        return { status: 'done', sourcePage: `modules/linked/wiki/sources/${SLUG}.md` };
      },
    },
    {
      name: 'the ingest protocol changed after the hand-over',
      code: 'ingest-touched',
      arrange: async () => {
        await vault.write(PAGE, pageText());
        await vault.write(PROTOCOL, `${(await vault.read(PROTOCOL)) ?? ''}\n`);
        return { status: 'done', sourcePage: PAGE };
      },
    },
  ];

  it.each(refusals)(
    'a result is refused when the page is missing, its frontmatter is invalid, it lies outside the module wiki or the ingest protocol was touched — bookkeeping unchanged ($name)',
    async ({ module, code, arrange }) => {
      const job = await handOver(module === undefined ? MODULE : module);
      const fields = await arrange(job.id);
      const before = await bookkeeping();
      await writeResult(job.id, fields);

      await settleAgentJobs(deps);

      expect(await bookkeeping()).toEqual(before);
      expect(await finishedJob(job.id)).toMatchObject({
        outcome: 'failed',
        reason: CONDENSE_REFUSALS[code],
      });
    },
  );

  it('a conflict on the ingest protocol while booking takes back the index and log entries', async () => {
    const job = await handOver();
    await vault.write(PAGE, pageText());
    await writeResult(job.id, { status: 'done', sourcePage: PAGE });
    const before = await bookkeeping();
    const store = Object.create(vault.store) as typeof vault.store;
    store.writeText = async (path, content, options) => {
      if (path === PROTOCOL) {
        throw new VaultConflictError({ path, expectedHash: 'read', actualHash: 'changed' });
      }
      return vault.store.writeText(path, content, options);
    };

    await settleAgentJobs({ ...deps, store });

    expect(await bookkeeping()).toEqual(before);
    expect(await finishedJob(job.id)).toMatchObject({
      outcome: 'failed',
      reason: CONDENSE_REFUSALS['ingest-touched'],
    });
  });

  it('a protocol that is no longer readable while booking takes back the index and log entries', async () => {
    const job = await handOver();
    await vault.write(PAGE, pageText());
    await writeResult(job.id, { status: 'done', sourcePage: PAGE });
    const before = await bookkeeping();
    // Reads 1 and 2 are the validation and the check under the lock; the protocol vanishes
    // before the booking step reads it.
    let protocolReads = 0;
    const store = Object.create(vault.store) as typeof vault.store;
    store.readText = async (path) => {
      if (path === PROTOCOL && ++protocolReads > 2) return null;
      return vault.store.readText(path);
    };

    await settleAgentJobs({ ...deps, store });

    expect(await bookkeeping()).toEqual(before);
    expect(await finishedJob(job.id)).toMatchObject({
      outcome: 'failed',
      reason: CONDENSE_REFUSALS['ingest-touched'],
    });
  });

  it.each(['failed', 'skipped'] as const)(
    "a failed or skipped result keeps the agent's reason (%s)",
    async (status) => {
      const job = await handOver();
      const before = await bookkeeping();
      await writeResult(job.id, { status, reason: 'The source holds no readable text.' });

      expect(await settleAgentJobs(deps)).toBe(true);

      expect(await bookkeeping()).toEqual(before);
      expect(await finishedJob(job.id)).toMatchObject({
        outcome: status,
        reason: 'The source holds no readable text.',
      });
    },
  );

  it('a late result after withdrawal books nothing', async () => {
    const job = await handOver();
    await deps.jobs.finish(job.id, 'withdrawn', null);
    await vault.write(PAGE, pageText());
    const before = await bookkeeping();
    await writeResult(job.id, { status: 'done', sourcePage: PAGE });

    expect(await settleAgentJobs(deps)).toBe(true);

    expect(await bookkeeping()).toEqual(before);
    expect(await finishedJob(job.id)).toMatchObject({ outcome: 'withdrawn' });
    expect(await readdir(vault.absolute(AGENT_DIRS.results))).toEqual([]);
  });

  it('a job without a result stays open', async () => {
    const job = await handOver();

    expect(await settleAgentJobs(deps)).toBe(false);

    expect((await deps.jobs.open()).map((open) => open.id)).toEqual([job.id]);
  });
});
