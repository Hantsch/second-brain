/* Die Modellstufe der losen Enden (020, D4). Geprüft wird vor allem, was **nicht**
   durchkommt, denn hier redet ein Modell über Tagebuchprosa:

   - es findet, was die Regel nicht sieht (englische Zeitangabe) — und der Fund
     trägt `origin: 'model'`, mit Pfad und Zeile aus der Datei, nicht aus der
     Antwort;
   - ein umschriebenes, erfundenes oder aus einem unbekannten Tag zitiertes
     Zitat fällt weg, ebenso ein `refDate`, das noch nicht vorbei ist, ebenso ein
     Betreff mit eigenen Wörtern (Guardrail 3);
   - ohne Route läuft die Stufe nicht, der Lauf bleibt vollständig und `usedLlm`
     bleibt `false` (Guardrail 1);
   - kein Satz Tagebuchtext landet in einer Log-Zeile oder einer Fehlermeldung
     (Guardrail 6);
   - ein abgebrochenes `signal` bricht den Aufruf ab, nicht den Pflegelauf. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runGardener } from '@core/gardener';
import { findLooseEnds, modelLooseEnds } from '@core/journal';
import type { LooseEndDay } from '@core/journal';
import type { GardenerFinding } from '@shared/types';
import { emptyGateway, gatewayWithReplies } from '../../helpers/llm';
import { SETTINGS, gardenerFixture } from '../gardener/fixtures';
import { journalFile, journalPathOf } from './fixtures';
import { day } from '../../helpers/time';

/** Uhr der Fixtures (`tests/helpers/time.ts`). */
const TODAY = '2026-08-10';

/* Der Fall, den die Heuristik bewusst offen lässt: englische Zeitangabe ohne
   ausgeschriebenes Datum — `findDates()` löst sie nicht auf (D1, „Scope of the
   heuristic"). Der Tag ist vorbei, niemand hat seither etwas dazu gesagt. */
const ENGLISH_DAY = day(-5);
const ENGLISH_TEXT = 'Tomorrow I am signing the lease at the notary.';
/* Und ein Fall, den die Heuristik selbst findet — damit „was das Modell
   dazulegt" von „was ohnehin schon dasteht" unterscheidbar bleibt. */
const GERMAN_DAY = day(-8);
const GERMAN_TEXT = 'Morgen habe ich einen Zahnarzttermin.';

function vaultFiles(): Record<string, string> {
  return {
    [journalPathOf(ENGLISH_DAY)]: journalFile(ENGLISH_DAY, ENGLISH_TEXT),
    [journalPathOf(GERMAN_DAY)]: journalFile(GERMAN_DAY, GERMAN_TEXT),
  };
}

/** Die Tage als Eingabe der Stufe — derselbe Rumpf, den der Index trägt. */
function days(): LooseEndDay[] {
  return [
    {
      day: { date: ENGLISH_DAY, path: journalPathOf(ENGLISH_DAY) },
      doc: { body: `## Tag\n\n${ENGLISH_TEXT}\n`, bodyLine: 8 },
    },
    {
      day: { date: GERMAN_DAY, path: journalPathOf(GERMAN_DAY) },
      doc: { body: `## Tag\n\n${GERMAN_TEXT}\n`, bodyLine: 8 },
    },
  ];
}

function reply(looseEnds: readonly Record<string, unknown>[]): Record<string, string> {
  return { 'journal-loose-ends': JSON.stringify({ looseEnds }) };
}

/** Gateway mit Route **nur** auf diese Aufgabe: die Deutung bleibt damit aussen vor. */
function looseEndGateway(looseEnds: readonly Record<string, unknown>[]) {
  return gatewayWithReplies(reply(looseEnds), ['journal-loose-ends']);
}

/** Der Vorschlag, der durchkommen soll. */
const VALID = {
  day: ENGLISH_DAY,
  quote: ENGLISH_TEXT,
  subject: 'signing lease notary',
  refDate: day(-4),
};

function looseEndsOf(findings: readonly GardenerFinding[]): GardenerFinding[] {
  return findings.filter((finding) => finding.kind === 'loose-end');
}

describe('modelLooseEnds', () => {
  it('legt ein loses Ende dazu, das die Heuristik nicht sieht — mit Herkunft, Pfad und Zeile', async () => {
    const { gateway, provider } = looseEndGateway([VALID]);

    const result = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });

    /* Die Regel selbst findet den englischen Satz nicht — nur den deutschen. */
    const heuristic = findLooseEnds(days(), [], TODAY);
    expect(heuristic.map((end) => end.quote)).toEqual([GERMAN_TEXT]);

    expect(result.usedLlm).toBe(true);
    expect(result.looseEnds).toHaveLength(1);
    expect(result.looseEnds[0]).toMatchObject({
      day: ENGLISH_DAY,
      path: journalPathOf(ENGLISH_DAY),
      quote: ENGLISH_TEXT,
      refDate: day(-4),
      origin: 'model',
    });
    /* Zeile aus der Datei: 'Tomorrow …' steht auf Rumpfzeile 2 hinter '## Tag'. */
    expect(result.looseEnds[0]?.line).toBe(8 + 2);
    expect(provider.countFor('journal-loose-ends')).toBe(1);
  });

  it('verwirft ein Zitat, das nicht wortwörtlich in der genannten Datei steht', async () => {
    const { gateway } = looseEndGateway([
      /* Umschrieben — dasselbe gemeint, andere Worte. */
      { ...VALID, quote: 'Tomorrow I sign the lease at the notary office.' },
      /* Frei erfunden. */
      { ...VALID, quote: 'Morgen bin ich beim Notar.' },
      /* Wortwörtlich, aber aus einem Tag, der nicht mitgeschickt wurde. */
      { ...VALID, day: day(-40) },
      /* Aus dem falschen Tag zitiert. */
      { ...VALID, day: GERMAN_DAY, refDate: day(-7) },
    ]);

    const result = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });

    expect(result.usedLlm).toBe(true);
    expect(result.looseEnds).toEqual([]);
  });

  it('verwirft einen angekündigten Tag, der noch nicht vorbei ist, und einen ohne Vorlauf', async () => {
    const { gateway } = looseEndGateway([
      { ...VALID, refDate: TODAY },
      { ...VALID, refDate: day(3) },
      { ...VALID, refDate: ENGLISH_DAY },
      { ...VALID, refDate: 'irgendwann' },
    ]);

    const result = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });

    expect(result.looseEnds).toEqual([]);
  });

  it('nimmt in den Betreff nur Wörter, die im zitierten Satz stehen', async () => {
    const { gateway } = looseEndGateway([
      { ...VALID, subject: 'Wohnungskauf lease Scheidung notary' },
    ]);

    const result = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });

    expect(result.looseEnds[0]?.subject).toBe('lease notary');
  });

  it('meldet nicht noch einmal, was die Heuristik schon gefunden hat', async () => {
    const heuristic = findLooseEnds(days(), [], TODAY);
    const known = heuristic[0];
    expect(known).toBeDefined();
    const { gateway } = looseEndGateway([
      { day: GERMAN_DAY, quote: GERMAN_TEXT, subject: 'Zahnarzttermin', refDate: day(-7) },
    ]);

    const result = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });

    expect(result.looseEnds).toEqual([]);
    /* Und die Kennung ist in beiden Wegen dieselbe — sonst liesse sich derselbe
       Satz zweimal beantworten und ein Ausblenden ginge verloren. */
    expect(known?.id).toBeDefined();
  });

  it('verwirft einen Vorschlag, den ein spaeterer Tag schon beantwortet hat', async () => {
    /* Derselbe Abzug, den die Heuristik macht (D1, Schritt 4): ein spaeterer Tag
       verlinkt den ankuendigenden und nimmt sein Thema wieder auf. Dass ein
       Modell die Antwort uebersieht, darf ein Ende nicht wieder aufmachen. */
    const answeredDays: LooseEndDay[] = [
      ...days(),
      {
        day: { date: day(-2), path: journalPathOf(day(-2)) },
        doc: {
          body: `## Tag\n\nThe lease from [[${ENGLISH_DAY}]] is signed.\n`,
          bodyLine: 8,
        },
      },
    ];
    const { gateway } = looseEndGateway([VALID]);

    const result = await modelLooseEnds(
      { days: answeredDays, todos: [], today: TODAY },
      { gateway },
    );

    expect(result.looseEnds).toEqual([]);
    /* Das Modell wurde gefragt — verworfen hat der Abzug, nicht die Route. */
    expect(result.usedLlm).toBe(true);
  });

  it('verwirft einen Vorschlag, der schon ein Todo mit Frist ist', async () => {
    const { gateway } = looseEndGateway([VALID]);

    const result = await modelLooseEnds(
      {
        days: days(),
        todos: [{ text: 'Lease signing beim Notary vorbereiten', due: day(-3) }],
        today: TODAY,
      },
      { gateway },
    );

    expect(result.looseEnds).toEqual([]);
    expect(result.usedLlm).toBe(true);
  });

  it('laesst denselben Vorschlag durch, solange nichts ihn beantwortet', async () => {
    const { gateway } = looseEndGateway([VALID]);

    const result = await modelLooseEnds(
      {
        days: days(),
        todos: [{ text: 'Lease signing beim Notary vorbereiten', due: null }],
        today: TODAY,
      },
      { gateway },
    );

    expect(result.looseEnds.map((end) => end.quote)).toEqual([ENGLISH_TEXT]);
  });

  it('fragt kein Modell ohne Route und keines ohne Prosa', async () => {
    const withoutRoute = await modelLooseEnds(
      { days: days(), todos: [], today: TODAY },
      { gateway: emptyGateway() },
    );
    expect(withoutRoute).toEqual({ usedLlm: false, looseEnds: [], model: null });

    const { gateway, provider } = looseEndGateway([VALID]);
    /* Nur Tage, die noch nicht vorbei sind: da ist nichts fällig geworden. */
    const future = await modelLooseEnds(
      {
        days: [
          {
            day: { date: TODAY, path: journalPathOf(TODAY) },
            doc: { body: `## Tag\n\n${ENGLISH_TEXT}\n`, bodyLine: 8 },
          },
        ],
        todos: [],
        today: TODAY,
      },
      { gateway },
    );

    expect(future.usedLlm).toBe(false);
    expect(provider.callCount).toBe(0);
  });

  it('bleibt still, wenn die Antwort kein JSON ist', async () => {
    const { gateway } = gatewayWithReplies(
      { 'journal-loose-ends': 'Tut mir leid, ich kann das nicht.' },
      ['journal-loose-ends'],
    );

    const result = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });

    expect(result).toEqual({ usedLlm: false, looseEnds: [], model: null });
  });
});

describe('Datenschutz: kein Tagebuchtext in Logs oder Fehlern', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('schreibt keine Zeile und trägt keinen Satz in einen Fehler', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {}),
    );
    const { gateway, provider } = looseEndGateway([VALID]);
    /* Ein Modellfehler, dessen Meldung selbst Tagebuchtext trägt — das ist der
       Weg, auf dem Inhalt sonst in ein Log rutscht. */
    provider.fail('journal-loose-ends', new Error(`Kontext abgelehnt: ${ENGLISH_TEXT}`));

    const failed = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });
    expect(failed).toEqual({ usedLlm: false, looseEnds: [], model: null });

    provider.setReply('journal-loose-ends', JSON.stringify({ looseEnds: [VALID] }));
    const ok = await modelLooseEnds({ days: days(), todos: [], today: TODAY }, { gateway });
    expect(ok.looseEnds).toHaveLength(1);

    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('runGardener mit der Modellstufe', () => {
  it('nimmt den Fund des Modells in den Bericht auf, als „vom Modell gefunden"', async () => {
    const fixture = await gardenerFixture(vaultFiles());
    const { gateway } = looseEndGateway([VALID]);

    const report = await runGardener(fixture.deps(gateway), {
      settings: SETTINGS,
      useLlm: true,
    });

    expect(report.usedLlm).toBe(true);
    const found = looseEndsOf(report.findings);
    expect(found).toHaveLength(2);
    const origins = found.map((finding) => finding.origin).sort();
    expect(origins).toEqual(['heuristic', 'model']);
    const fromModel = found.find((finding) => finding.origin === 'model');
    expect(fromModel?.severity).toBe('info');
    expect(fromModel?.fix).toBeNull();
    expect(fromModel?.paths).toEqual([journalPathOf(ENGLISH_DAY)]);
    expect(fromModel?.title).toContain(ENGLISH_TEXT);
  });

  it('lässt einen ausgeblendeten Fund des Modells ausgeblendet', async () => {
    const fixture = await gardenerFixture(vaultFiles());
    const { gateway } = looseEndGateway([VALID]);
    const before = await runGardener(fixture.deps(gateway), { settings: SETTINGS, useLlm: true });
    const target = looseEndsOf(before.findings).find((finding) => finding.origin === 'model');
    expect(target).toBeDefined();

    const after = await runGardener(fixture.deps(looseEndGateway([VALID]).gateway), {
      settings: SETTINGS,
      useLlm: true,
      dismissed: [target?.id ?? ''],
    });

    expect(looseEndsOf(after.findings).map((finding) => finding.origin)).toEqual(['heuristic']);
  });

  it('bleibt ohne Modell vollständig: nur die Heuristik, `usedLlm` falsch', async () => {
    const fixture = await gardenerFixture(vaultFiles());

    const withoutModel = await runGardener(fixture.deps(emptyGateway()), {
      settings: SETTINGS,
      useLlm: true,
    });

    expect(withoutModel.usedLlm).toBe(false);
    const found = looseEndsOf(withoutModel.findings);
    expect(found).toHaveLength(1);
    expect(found[0]?.origin).toBe('heuristic');
    expect(found[0]?.paths).toEqual([journalPathOf(GERMAN_DAY)]);
  });

  it('bricht bei abgebrochenem `signal` den Aufruf ab, nicht den Lauf', async () => {
    const fixture = await gardenerFixture(vaultFiles());
    const { gateway } = looseEndGateway([VALID]);
    const controller = new AbortController();
    controller.abort();

    const report = await runGardener(
      { ...fixture.deps(gateway), signal: controller.signal },
      { settings: SETTINGS, useLlm: true },
    );

    expect(report.usedLlm).toBe(false);
    const found = looseEndsOf(report.findings);
    expect(found).toHaveLength(1);
    expect(found[0]?.origin).toBe('heuristic');
  });
});
