/* Die LLM-Deutung. Was hier geprüft wird, ist vor allem, was **nicht** durchkommt:
   ein erfundener Pfad, eine fremde Kennung, ein vierter Ratschlag. Und dass der
   Lauf ohne Modell vollständig bleibt. */

import { describe, expect, it } from 'vitest';
import { auditFindings, auditPages, runGardener, stalePageCheck } from '@core/gardener';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { DEMO } from './demo-vault';
import { SETTINGS, demoFixture, gardenerFixture, moduleFixture } from './fixtures';

function reply(body: Record<string, unknown>): Record<'gardener-audit', string> {
  return {
    'gardener-audit': JSON.stringify({
      contradictions: [],
      confirmed: [],
      rejected: [],
      advice: [],
      ...body,
    }),
  };
}

/* Zwei Seiten, die denselben Absatz tragen und sich nur im Schluss unterscheiden —
   genug für eine Beinahe-Dublette. */
const SHARED = `Die Angebotsliste im Kundenportal lädt bei vierhundert Einträgen langsam, weil für jede
Zeile die Berechtigungen einzeln nachgeladen werden. Ein Sammelaufruf würde die Zahl der
Abfragen von vierhundert auf eine senken und die Wartezeit unter eine Sekunde drücken.`;
const TAIL_A = 'Gemessen wurde das am Testsystem mit gefülltem Zwischenspeicher.';
const TAIL_B = 'Nachgeprüft hat es niemand, die Vermutung stammt aus dem Gespräch.';

/* Zwei Seiten, die sich widersprechen, ohne dass es irgendwo benannt ist — beide
   sind angestaubt und stehen deshalb im Prompt. */
async function unnamedPair() {
  return moduleFixture('wissen', [
    {
      type: 'concept',
      slug: 'sitzungsdauer',
      title: 'Sitzungsdauer',
      summary: 'Acht Stunden',
      reviewed: -200,
      created: -300,
      body: 'Eine Sitzung läuft acht Stunden, danach ist eine neue Anmeldung nötig.',
    },
    {
      type: 'concept',
      slug: 'sitzung-kurz',
      title: 'Sitzung, kurze Fassung',
      summary: 'Eine Stunde',
      reviewed: -200,
      created: -300,
      body: 'Eine Sitzung endet nach einer Stunde ohne Aktivität und wird nicht verlängert.',
    },
  ]);
}

describe('auditFindings', () => {
  it('benennt einen Widerspruch mit beiden Pfaden und einem Satz', async () => {
    const fixture = await unnamedPair();
    const ctx = fixture.ctx({ settings: SETTINGS });
    const findings = stalePageCheck.run(ctx);
    const { gateway, provider } = gatewayWithReplies(
      reply({
        contradictions: [
          {
            pathA: 'modules/wissen/wiki/concepts/sitzungsdauer.md',
            pathB: 'modules/wissen/wiki/concepts/sitzung-kurz.md',
            note: 'Eine Seite nennt acht Stunden, die andere eine Stunde.',
          },
        ],
        advice: ['Die kürzere Fassung am Testmandanten nachprüfen.'],
      }),
    );

    const result = await auditFindings(ctx, findings, { gateway });

    expect(result.usedLlm).toBe(true);
    expect(result.contradictions).toHaveLength(1);
    const contradiction = result.contradictions[0];
    expect(contradiction?.paths).toEqual([
      'modules/wissen/wiki/concepts/sitzung-kurz.md',
      'modules/wissen/wiki/concepts/sitzungsdauer.md',
    ]);
    expect(contradiction?.detail).toContain('acht Stunden');
    expect(contradiction?.severity).toBe('high');
    /* Der Fix schreibt höchstens eine benannte Notiz — und zwar genau diese Zeile.
       Die Beschriftung sagt das auch: benennen, nicht auflösen. */
    expect(contradiction?.fix?.action).toBe('add-links');
    expect(contradiction?.fix?.label).toBe('Widerspruch benennen');
    expect(contradiction?.fix?.preview).toBe(
      '- [[sitzungsdauer]] widerspricht dieser Seite: Eine Seite nennt acht Stunden, die andere eine Stunde.',
    );
    expect(result.advice).toEqual(['Die kürzere Fassung am Testmandanten nachprüfen.']);
    expect(provider.countFor('gardener-audit')).toBe(1);
  });

  it('verwirft einen Widerspruch mit erfundenem Pfad', async () => {
    const fixture = await unnamedPair();
    const ctx = fixture.ctx({ settings: SETTINGS });
    const { gateway } = gatewayWithReplies(
      reply({
        contradictions: [
          {
            pathA: 'modules/wissen/wiki/concepts/sitzungsdauer.md',
            pathB: 'modules/wissen/wiki/concepts/gibt-es-nicht.md',
            note: 'Klingt plausibel, ist aber erfunden.',
          },
          {
            pathA: 'modules/wissen/wiki/concepts/sitzungsdauer.md',
            pathB: 'modules/wissen/wiki/concepts/sitzungsdauer.md',
            note: 'Eine Seite widerspricht sich selbst.',
          },
        ],
      }),
    );

    const result = await auditFindings(ctx, stalePageCheck.run(ctx), { gateway });

    expect(result.usedLlm).toBe(true);
    expect(result.contradictions).toEqual([]);
  });

  it('meldet einen schon benannten Widerspruch als Hinweis, nicht als Schaden', async () => {
    const fixture = await demoFixture();
    const ctx = fixture.ctx({ settings: SETTINGS });
    const { gateway } = gatewayWithReplies(
      reply({
        contradictions: [
          {
            pathA: DEMO.token,
            pathB: DEMO.oldToken,
            note: 'Fünfzehn Minuten gegen zwölf Stunden.',
          },
        ],
      }),
    );

    const result = await auditFindings(ctx, [], { gateway });

    expect(result.contradictions).toHaveLength(1);
    expect(result.contradictions[0]?.severity).toBe('info');
    /* Schon benannt heisst: es gibt nichts zu schreiben. */
    expect(result.contradictions[0]?.fix).toBeNull();
  });

  it('nimmt nur Kennungen aus der Kandidatenliste', async () => {
    const fixture = await demoFixture();
    const ctx = fixture.ctx({ settings: SETTINGS });
    const { gateway } = gatewayWithReplies(
      reply({ confirmed: ['erfunden-1'], rejected: ['erfunden-2'] }),
    );

    const result = await auditFindings(ctx, [], { gateway });

    expect(result.confirmed).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('kürzt die Ratschläge auf drei und wirft Leeres weg', async () => {
    const fixture = await demoFixture();
    const ctx = fixture.ctx({ settings: SETTINGS });
    const { gateway } = gatewayWithReplies(
      reply({ advice: ['  Erstens.  ', '', 'Zweitens.', 'Drittens.', 'Viertens.'] }),
    );

    const result = await auditFindings(ctx, [], { gateway });

    expect(result.advice).toEqual(['Erstens.', 'Zweitens.', 'Drittens.']);
  });

  it('bleibt still, wenn die Antwort kein JSON ist', async () => {
    const fixture = await demoFixture();
    const ctx = fixture.ctx({ settings: SETTINGS });
    const { gateway } = gatewayWithReplies({
      'gardener-audit': 'Tut mir leid, ich kann das nicht.',
    });

    const result = await auditFindings(ctx, [], { gateway });

    expect(result.usedLlm).toBe(false);
    expect(result.contradictions).toEqual([]);
    expect(result.advice).toEqual([]);
  });

  it('fragt kein Modell, wenn es keine Seite zu deuten gibt', async () => {
    const fixture = await gardenerFixture({ 'README.md': '# Leer\n' });
    const { gateway, provider } = gatewayWithReplies(reply({}));

    const result = await auditFindings(fixture.ctx({ settings: SETTINGS }), [], { gateway });

    expect(result.usedLlm).toBe(false);
    expect(provider.callCount).toBe(0);
  });

  it('schickt nur Seiten in den Prompt, die es gibt', async () => {
    const fixture = await demoFixture();
    const ctx = fixture.ctx({ settings: SETTINGS });

    const pages = auditPages(ctx, []);

    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      expect(await fixture.text(page.path)).toContain('---');
    }
    expect(pages.map((page) => page.path)).toContain(DEMO.token);
  });
});

describe('runGardener mit Deutung', () => {
  it('nimmt einen verworfenen Kandidaten aus dem Bericht', async () => {
    const fixture = await moduleFixture('wissen', [
      {
        type: 'concept',
        slug: 'erste',
        title: 'Erste',
        summary: 'A',
        body: `${SHARED}\n${TAIL_A}`,
      },
      {
        type: 'concept',
        slug: 'zweite',
        title: 'Zweite',
        summary: 'B',
        body: `${SHARED}\n${TAIL_B}`,
      },
    ]);
    const before = await runGardener(fixture.deps(), { settings: SETTINGS });
    const candidate = before.findings.find((finding) => finding.kind === 'near-duplicate');
    expect(candidate).toBeDefined();

    const { gateway } = gatewayWithReplies(reply({ rejected: [candidate?.id ?? ''] }));
    const after = await runGardener(fixture.deps(gateway), { settings: SETTINGS, useLlm: true });

    expect(after.usedLlm).toBe(true);
    expect(after.findings.map((finding) => finding.kind)).not.toContain('near-duplicate');
  });

  it('behält alle deterministischen Befunde, wenn kein Modell zugeordnet ist', async () => {
    const fixture = await demoFixture();

    const withModel = await runGardener(fixture.deps(gatewayWithReplies(reply({})).gateway), {
      settings: SETTINGS,
      useLlm: true,
    });
    const without = await runGardener(fixture.deps(emptyGateway()), {
      settings: SETTINGS,
      useLlm: true,
    });

    expect(without.usedLlm).toBe(false);
    expect(without.findings.map((finding) => finding.id)).toEqual(
      withModel.findings.map((finding) => finding.id),
    );
  });
});
