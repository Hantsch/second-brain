import { describe, expect, it } from 'vitest';
import { FakeProvider } from '@core/llm';
import type { ProviderCall } from '@core/llm';

function call(patch: Partial<ProviderCall> = {}): ProviderCall {
  return {
    task: 'title-tags',
    model: 'fake-small',
    messages: [{ role: 'user', content: 'Ein Text über Deployment' }],
    ...patch,
  };
}

describe('FakeProvider', () => {
  it('antwortet deterministisch je Aufgabe', async () => {
    const provider = new FakeProvider({
      replies: { 'title-tags': '{"title":"Deployment"}' },
      fallback: 'sonst',
    });
    expect((await provider.complete(call())).text).toBe('{"title":"Deployment"}');
    expect((await provider.complete(call({ task: 'summarize-source' }))).text).toBe('sonst');
  });

  it('nimmt eine Funktion als Antwort', async () => {
    const provider = new FakeProvider({ fallback: (c) => `${c.task}/${c.model}` });
    expect((await provider.complete(call())).text).toBe('title-tags/fake-small');
  });

  it('antwortet ohne Konfiguration erkennbar und bei Schema mit JSON', async () => {
    const provider = new FakeProvider();
    expect((await provider.complete(call())).text).toBe(
      '[fake:title-tags] Ein Text über Deployment',
    );
    const structured = await provider.complete(call({ schema: { type: 'object' } }));
    expect(JSON.parse(structured.text)).toEqual({});
  });

  it('zählt Aufrufe und protokolliert sie', async () => {
    const provider = new FakeProvider({ fallback: 'x' });
    await provider.complete(call());
    await provider.complete(call({ task: 'query-answer' }));
    await provider.complete(call());

    expect(provider.callCount).toBe(3);
    expect(provider.countFor('title-tags')).toBe(2);
    expect(provider.lastCall()?.task).toBe('title-tags');
    expect(provider.lastCall('query-answer')?.messages).toEqual([
      { role: 'user', content: 'Ein Text über Deployment' },
    ]);

    provider.reset();
    expect(provider.callCount).toBe(0);
    expect(provider.lastCall()).toBeNull();
  });

  it('simuliert Fehler je Aufgabe und für alles', async () => {
    const provider = new FakeProvider({ fallback: 'x' });
    provider.fail('title-tags', 'Modell überlastet');
    await expect(provider.complete(call())).rejects.toThrow('Modell überlastet');
    await expect(provider.complete(call({ task: 'query-answer' }))).resolves.toMatchObject({
      text: 'x',
    });

    const alwaysFails = new FakeProvider({ failEverything: new Error('kaputt') });
    await expect(alwaysFails.complete(call())).rejects.toThrow('kaputt');
  });

  it('setReply überschreibt einen zuvor gesetzten Fehler', async () => {
    const provider = new FakeProvider({ errors: { 'title-tags': 'kaputt' } });
    provider.setReply('title-tags', 'jetzt gut');
    expect((await provider.complete(call())).text).toBe('jetzt gut');
  });

  it('streamt in Stücken und gibt am Ende alles zurück', async () => {
    const provider = new FakeProvider({ fallback: 'abcdefg', chunkSize: 3 });
    const deltas: string[] = [];
    const result = await provider.stream(call(), (delta) => deltas.push(delta));
    expect(deltas).toEqual(['abc', 'def', 'g']);
    expect(result.text).toBe('abcdefg');
    expect(provider.lastCall()?.streamed).toBe(true);
  });

  it('respektiert ein abgebrochenes Signal', async () => {
    const provider = new FakeProvider({ fallback: 'x' });
    const controller = new AbortController();
    controller.abort();
    await expect(provider.complete(call({ signal: controller.signal }))).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('liefert Modelle und eine Probe ohne Netz', async () => {
    const provider = new FakeProvider({ models: ['a', 'b'] });
    expect(await provider.listModels()).toEqual(['a', 'b']);
    const probe = await provider.probe();
    expect(probe).toMatchObject({ ok: true, modelCount: 2 });

    const broken = new FakeProvider({ probeOk: false });
    expect((await broken.probe()).ok).toBe(false);
  });

  it('gibt Usage zurück, wenn sie konfiguriert ist', async () => {
    const provider = new FakeProvider({ usage: { inputTokens: 5 } });
    expect((await provider.complete(call())).usage).toEqual({ inputTokens: 5 });
  });
});
