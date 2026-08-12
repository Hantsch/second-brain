/* Die einzelnen Signale. Sie tragen die Einordnung ohne Modell, deshalb wird
   jedes für sich geprüft — und zwar an deutschem Text mit Umlauten: `\b` würde
   genau dort versagen, wo es zählt. */

import { describe, expect, it } from 'vitest';
import {
  findUrls,
  findWaitingOn,
  hostOf,
  isTask,
  moodSignals,
  scopeSignals,
  sentences,
  taskText,
} from '@core/capture';

describe('sentences', () => {
  it('trennt Sätze, aber nicht am Punkt eines Datums', () => {
    const list = sentences('Abnahmeprotokoll bis 15.08. durchgehen. Danach Ladezeiten.');
    expect(list.map((entry) => entry.text)).toEqual([
      'Abnahmeprotokoll bis 15.08. durchgehen.',
      'Danach Ladezeiten.',
    ]);
  });

  it('nimmt Listenzeichen und Checkbox weg und merkt sich den Zustand', () => {
    const list = sentences('- [x] Fertig\n- [ ] Offen\n* Auch offen\n1. Nummeriert');
    expect(list.map((entry) => [entry.text, entry.listItem, entry.checked])).toEqual([
      ['Fertig', true, true],
      ['Offen', true, false],
      ['Auch offen', true, false],
      ['Nummeriert', true, false],
    ]);
  });

  it('überspringt Überschriften, Zitate und Code-Zäune', () => {
    const list = sentences('# Titel\n> Zitat\n```\n- [ ] nur ein Beispiel\n```\nEchter Satz.');
    expect(list.map((entry) => entry.text)).toEqual(['Echter Satz.']);
  });
});

describe('isTask', () => {
  const only = (text: string): boolean => {
    const entry = sentences(text)[0];
    return entry !== undefined && isTask(entry);
  };

  it('nimmt Absichtswörter und Infinitive am Satzende', () => {
    expect(only('Ich muss noch Miriam anrufen.')).toBe(true);
    expect(only('Bretter auf Länge sägen.')).toBe(true);
    expect(only('Noppenfolie innen anbringen.')).toBe(true);
  });

  it('lässt Berichte und Gefühle liegen', () => {
    expect(only('Wir haben das Deployment besprochen.')).toBe(false);
    expect(only('Der Testlauf lief durch.')).toBe(false);
    expect(only('Ich fühle mich überfordert.')).toBe(false);
  });

  it('behandelt einen Listenpunkt als Aufgabe, einen Gefühlspunkt nicht', () => {
    expect(only('- Kaffee')).toBe(true);
    expect(only('- Ich bin müde')).toBe(false);
  });
});

describe('taskText', () => {
  it('nimmt die Vorsilbe weg und schreibt groß', () => {
    expect(taskText('ich muss noch Miriam anrufen.')).toBe('Miriam anrufen');
    expect(taskText('TODO: Index prüfen')).toBe('Index prüfen');
    expect(taskText('Nicht vergessen: Erde holen')).toBe('Erde holen');
    expect(taskText('noch Bretter sägen')).toBe('Bretter sägen');
  });
});

describe('findWaitingOn', () => {
  it('erkennt „warte auf X" mit Sache', () => {
    expect(findWaitingOn('Ich warte noch auf Jonas wegen des Fallbacks.')).toEqual([
      { who: 'Jonas', what: 'wegen des Fallbacks' },
    ]);
  });

  it('nimmt bei „warte auf X" ohne Sache den Satz als Zusammenhang', () => {
    expect(findWaitingOn('Ich warte auf Miriam.')).toEqual([
      { who: 'Miriam', what: 'Ich warte auf Miriam' },
    ]);
  });

  it('erkennt „Rückmeldung von X" und „X muss noch Y"', () => {
    expect(findWaitingOn('Die Rückmeldung von Stefan Meier fehlt.')).toEqual([
      { who: 'Stefan Meier', what: 'Rückmeldung' },
    ]);
    expect(findWaitingOn('Jonas muss noch den Fallback bauen.')).toEqual([
      { who: 'Jonas', what: 'den Fallback bauen' },
    ]);
  });

  it('hält ein Satzanfangswort nicht für einen Namen', () => {
    expect(findWaitingOn('Das muss noch raus.')).toEqual([]);
    expect(findWaitingOn('Es muss noch geprüft werden.')).toEqual([]);
  });

  it('findet in einem Bericht keinen Wartenden', () => {
    expect(findWaitingOn('Miriam hat drei Punkte nachgereicht.')).toEqual([]);
  });
});

describe('findUrls', () => {
  it('findet Links und schneidet Satzzeichen ab', () => {
    expect(findUrls('Siehe https://example.com/a-b?c=1 (gut).')).toEqual([
      'https://example.com/a-b?c=1',
    ]);
    expect(findUrls('www.example.org, lesen!')).toEqual(['www.example.org']);
  });

  it('kürzt den Host für eine Begründung', () => {
    expect(hostOf('https://www.example.com/pfad')).toBe('example.com');
  });
});

describe('moodSignals und scopeSignals', () => {
  it('erkennt Gefühlsworte auch mit Umlaut und in ASCII-Schreibweise', () => {
    expect(moodSignals('Ich bin müde und überfordert.')).toEqual(['müde', 'überfordert']);
    expect(moodSignals('Bin muede und ueberfordert.')).toEqual(['muede', 'ueberfordert']);
  });

  it('trennt Arbeit von Privat an Signalwörtern', () => {
    const work = scopeSignals('Im Meeting mit dem Kunden ging es um das Deployment.');
    expect(work.work).toEqual(expect.arrayContaining(['meeting', 'kunden', 'deployment']));
    expect(work.private).toEqual([]);

    const home = scopeSignals('Für den Balkon noch Erde besorgen, danach Urlaub.');
    expect(home.private).toEqual(expect.arrayContaining(['balkon', 'urlaub']));
    expect(home.work).toEqual([]);
  });
});
