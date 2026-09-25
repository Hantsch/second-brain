/* Die englischen Signale — dasselbe Verhalten wie in `signals.test.ts`, nur an
   englischem Text und nur aktiv, wenn 'en' explizit in `languages` steht. Ohne
   das bleibt der deutsche Standard unberuehrt (siehe letzter Testfall). */

import { describe, expect, it } from 'vitest';
import { isTask, moodSignals, scopeSignals, sentences, taskText } from '@core/capture';

describe('English signals', () => {
  it('detects English moods, intents and imperatives', () => {
    expect(moodSignals('I feel tired and overwhelmed.', ['en'])).toEqual([
      'i feel',
      'tired',
      'overwhelmed',
    ]);

    const work = scopeSignals('The client asked for a new invoice.', ['en']);
    expect(work.work).toEqual(expect.arrayContaining(['client', 'invoice']));
    expect(work.private).toEqual([]);

    const only = (text: string): boolean => {
      const entry = sentences(text)[0];
      return entry !== undefined && isTask(entry, ['en']);
    };
    expect(only('I need to call the bank.')).toBe(true);
    expect(only('Call the dentist tomorrow.')).toBe(true);
    expect(only("Don't forget to pay the rent.")).toBe(true);
  });

  it('an English report sentence is not a task', () => {
    const entry = sentences('I called the bank yesterday.')[0];
    expect(entry !== undefined && isTask(entry, ['en'])).toBe(false);
  });

  it('an English mood sentence is never a task', () => {
    const plain = sentences('I feel exhausted and anxious.')[0];
    expect(plain !== undefined && isTask(plain, ['en'])).toBe(false);

    const listed = sentences('- I feel exhausted')[0];
    expect(listed !== undefined && isTask(listed, ['en'])).toBe(false);
  });

  it('English words are ignored under the German default', () => {
    const entry = sentences('Need to call the bank.')[0];
    expect(entry !== undefined && isTask(entry)).toBe(false);
    expect(moodSignals('I feel tired')).toEqual([]);
  });

  it('taskText strips English prefixes when English is active', () => {
    expect(taskText('todo: call the dentist', ['en'])).toBe('Call the dentist');
    expect(taskText('I need to call the bank.', ['en'])).toBe('Call the bank');
    expect(taskText("don't forget to pay the rent", ['en'])).toBe('Pay the rent');
  });
});
