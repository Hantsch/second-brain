/* Tasks routed to the agent: the gateway files a job instead of calling a model, and answers
 * with the agent's result once the vault holds one. Real files, because the job queue is the
 * vault's `.secondbrain/agent/` folder and the agent writes to it from outside. */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentJobId, createFsAgentJobStore, parseAgentJobResult } from '@core/agent/jobs';
import { FakeProvider, LlmUnavailableError, MemoryKeyStore, RoutingGateway } from '@core/llm';
import { AGENT_ROUTE, type CompletionRequest, type Routing } from '@shared/types';
import { AGENT_DIRS } from '../../../src/shared/types/agent-setup';
import { createTempVault, type TempVault } from '../../helpers/vault';

const classify: CompletionRequest = {
  task: 'classify-dump',
  messages: [
    { role: 'system', content: 'File the dump.' },
    { role: 'user', content: 'Call the plumber on Friday.' },
  ],
  schema: { type: 'object' },
};

let vault: TempVault;

beforeEach(async () => {
  vault = await createTempVault();
});

afterEach(async () => {
  await vault.cleanup();
});

function gateway(routing: Routing, provider = new FakeProvider({ fallback: 'model answer' })) {
  return {
    provider,
    gateway: new RoutingGateway({
      routing,
      providers: [],
      keys: new MemoryKeyStore(),
      createProvider: () => provider,
      agentJobs: createFsAgentJobStore(vault.root),
      now: () => Date.parse('2026-10-27T09:00:00.000Z'),
    }),
  };
}

const toAgent: Routing = { tasks: { 'classify-dump': AGENT_ROUTE }, defaults: {} };

async function jobFiles(): Promise<string[]> {
  return readdir(join(vault.root, AGENT_DIRS.jobs)).catch(() => []);
}

async function failureOf(promise: Promise<unknown>): Promise<LlmUnavailableError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LlmUnavailableError);
  return error as LlmUnavailableError;
}

describe('agent route', () => {
  it('files one job with the full request and reports it as pending — no model is called', async () => {
    const { gateway: g, provider } = gateway(toAgent);
    expect(g.isAvailable('classify-dump')).toBe(true);

    const error = await failureOf(g.complete(classify));

    expect(error.reason).toBe('agent-pending');
    expect(provider.calls).toHaveLength(0);
    const id = agentJobId(classify);
    expect(await jobFiles()).toEqual([`${id}.json`]);
    const job = JSON.parse(
      await readFile(join(vault.root, AGENT_DIRS.jobs, `${id}.json`), 'utf8'),
    ) as Record<string, unknown>;
    expect(job).toEqual({
      version: 1,
      id,
      kind: 'llm-task',
      task: 'classify-dump',
      createdAt: '2026-10-27T09:00:00.000Z',
      messages: classify.messages,
      schema: { type: 'object' },
    });
  });

  it('triggering the same request again reuses the open job', async () => {
    const { gateway: g } = gateway(toAgent);
    await failureOf(g.complete(classify));
    await failureOf(g.complete(classify));
    await failureOf(g.complete({ ...classify, messages: [{ role: 'user', content: 'other' }] }));

    expect(await jobFiles()).toHaveLength(2);
  });

  it("returns the agent's done result as the answer, through complete and stream", async () => {
    const { gateway: g } = gateway(toAgent);
    await failureOf(g.complete(classify));
    await vault.write(
      `${AGENT_DIRS.results}/${agentJobId(classify)}.json`,
      JSON.stringify({ status: 'done', text: { folder: 'inbox' } }),
    );

    const done = await g.complete(classify);
    expect(done.text).toBe('{"folder":"inbox"}');
    expect(done.model).toEqual(AGENT_ROUTE);

    const deltas: string[] = [];
    await g.stream(classify, (delta) => deltas.push(delta));
    expect(deltas).toEqual(['{"folder":"inbox"}']);
  });

  it("reports a failed or skipped result with the agent's reason", async () => {
    const { gateway: g } = gateway(toAgent);
    await vault.write(
      `${AGENT_DIRS.results}/${agentJobId(classify)}.json`,
      JSON.stringify({ status: 'skipped', reason: 'unknown job kind' }),
    );

    const error = await failureOf(g.complete(classify));
    expect(error.reason).toBe('agent-failed');
    expect(error.info.detail).toBe('unknown job kind');
  });

  it('a task routed to a model never touches the job queue', async () => {
    const { gateway: g } = gateway({ tasks: {}, defaults: {} });
    expect((await failureOf(g.complete(classify))).reason).toBe('no-route');
    expect(await jobFiles()).toEqual([]);
  });

  it('without a job store the agent route counts as no route', async () => {
    const g = new RoutingGateway({ routing: toAgent, providers: [], keys: new MemoryKeyStore() });
    expect(g.isAvailable('classify-dump')).toBe(false);
    expect((await failureOf(g.complete(classify))).reason).toBe('no-route');
  });
});

describe('parseAgentJobResult', () => {
  it('accepts only the documented shapes', () => {
    expect(parseAgentJobResult('{"status":"done","text":"ok"}')).toEqual({
      status: 'done',
      text: 'ok',
    });
    expect(parseAgentJobResult('{"status":"failed"}')).toEqual({ status: 'failed', reason: '' });
    expect(parseAgentJobResult('{"status":"done"}')).toBeNull();
    expect(parseAgentJobResult('{"status":"maybe","text":"x"}')).toBeNull();
    expect(parseAgentJobResult('{"status":"do')).toBeNull();
  });
});
