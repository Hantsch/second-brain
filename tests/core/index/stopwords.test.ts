import { describe, expect, it } from 'vitest';
import { contentTerms } from '@core/index/stopwords';

describe('contentTerms', () => {
  it('drops the function words of a German question', () => {
    expect(contentTerms('was sind agents commands und was machen sie?')).toEqual([
      'agents',
      'commands',
    ]);
  });

  it('drops English function words and folds before comparing', () => {
    expect(contentTerms('What is the Rückmeldung about?')).toEqual(['Rückmeldung']);
    expect(contentTerms('Was weiß ich über OAuth?')).toEqual(['OAuth']);
  });

  it('keeps each word once', () => {
    expect(contentTerms('Token token TOKEN Rotation')).toEqual(['Token', 'Rotation']);
  });

  it('keeps every word when all of them are stopwords', () => {
    expect(contentTerms('was ist das')).toEqual(['was', 'ist', 'das']);
  });
});
