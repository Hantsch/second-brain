/* Which passages count as evidence for a question. The question from the Chats screen
 * that started this — „was sind agents commands und was machen sie?“ — was answered
 * with a YouTube transcript twice over, a module schema and no help page: function
 * words matched everywhere, `AGENTS.md` matched by its title, and the two transcripts
 * of one video each took their own slots. */

import { describe, expect, it } from 'vitest';
import { renderHelpModule } from '@core/agent/help/render';
import { askQuestion, retrieve } from '@core/wiki';
import { renderAgentsMd } from '@core/wiki/agents-md';
import { HELP_MODULE_SLUG } from '@shared/help-module';
import { emptyGateway } from '../../helpers/llm';
import { INDEX_PATH, LOG_PATH, MODULE, wikiFixture } from './fixtures';

const VIDEO_DIR = 'raw/youtube/f4mI3d-nTrI';
const TITLE = 'MCP Was Wrong From The Start (They Just Fixed It)';
const SCHEMA_PATH = `modules/${MODULE}/AGENTS.md`;

const SENTENCES = [
  'Agents talk to tools over a persistent connection, and that connection carries state.',
  'The new transport drops the stream, so agents reconnect for every single request.',
  'Stateless servers scale, but agents lose the follow-up question in between.',
  'The fix sends the follow-up as its own request that the agents answer later.',
];

function frontmatter(docType: string): string {
  return ['---', `doc_type: ${docType}`, `title: ${TITLE}`, 'lang: en', '---', ''].join('\n');
}

function videoFiles(withTimestamps: boolean): Record<string, string> {
  const files: Record<string, string> = {
    [`${VIDEO_DIR}/metadata.md`]: `${frontmatter('metadata')}# ${TITLE}\n\n**Kanal:** Better Stack\n`,
    [`${VIDEO_DIR}/transcript.md`]: `${frontmatter('transcript')}# ${TITLE} — Transcript\n\n${SENTENCES.join(' ')}\n`,
  };
  if (withTimestamps) {
    const lines = SENTENCES.map(
      (sentence, n) => `[\`00:0${n}:00\`](https://youtu.be/f4mI3d-nTrI?t=${n * 60}) ${sentence}`,
    );
    files[`${VIDEO_DIR}/transcript.timestamped.md`] =
      `${frontmatter('transcript')}# ${TITLE} — Transcript (timestamped)\n\n${lines.join('\n')}\n`;
  }
  return files;
}

async function chatsFixture(withTimestamps = true) {
  const extra: Record<string, string> = {
    ...videoFiles(withTimestamps),
    [SCHEMA_PATH]: renderAgentsMd(MODULE, 'Identity Management'),
  };
  for (const file of renderHelpModule()) extra[file.path] = file.content;
  return wikiFixture(extra);
}

describe('evidence quality', () => {
  it('answers the Chats question from the help module, not from function words', async () => {
    const fixture = await chatsFixture();

    const excerpts = retrieve(fixture.index, 'was sind agents commands und was machen sie?');

    expect(excerpts[0]?.path.startsWith(`modules/${HELP_MODULE_SLUG}/wiki/`)).toBe(true);
  });

  it('finds the English help page for a German question', async () => {
    const fixture = await chatsFixture();

    const excerpts = retrieve(fixture.index, 'Welche Befehle kennt der Agent?');

    expect(excerpts[0]?.path).toBe(`modules/${HELP_MODULE_SLUG}/wiki/concepts/screen-agent.md`);
  });

  it('starts an excerpt on the matching line, not on the title above it', async () => {
    const fixture = await chatsFixture();

    const excerpts = retrieve(fixture.index, 'Better Stack Kanal');
    const metadata = excerpts.find((excerpt) => excerpt.path === `${VIDEO_DIR}/metadata.md`);

    expect(metadata?.quote).toBe('**Kanal:** Better Stack');
  });

  it('never cites a module schema, catalog or chronicle', async () => {
    const fixture = await chatsFixture();

    const paths = [
      ...retrieve(fixture.index, 'was sind agents commands und was machen sie?', { limit: 24 }),
      ...retrieve(fixture.index, 'Wiki Seiten Quellen Modul', { limit: 24 }),
      ...retrieve(fixture.index, 'Token Katalog', { limit: 24 }),
    ].map((excerpt) => excerpt.path);

    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((path) => path.endsWith('/AGENTS.md'))).toBe(false);
    expect(paths).not.toContain(INDEX_PATH);
    expect(paths).not.toContain(LOG_PATH);
  });

  it('cites one transcript of a video, and the video as one source', async () => {
    const fixture = await chatsFixture();

    const excerpts = retrieve(fixture.index, 'agents follow-up request connection', { limit: 24 });
    const fromVideo = excerpts.filter((excerpt) => excerpt.path.startsWith(`${VIDEO_DIR}/`));

    expect(fromVideo.length).toBeGreaterThan(0);
    expect(fromVideo.length).toBeLessThanOrEqual(3);
    // The timestamped transcript is the one meant for citing: each line links its second.
    expect(fromVideo.map((excerpt) => excerpt.path)).not.toContain(`${VIDEO_DIR}/transcript.md`);
  });

  it('cites the prose transcript when there is no timestamped one', async () => {
    const fixture = await chatsFixture(false);

    const excerpts = retrieve(fixture.index, 'agents follow-up request connection', { limit: 24 });

    expect(excerpts.map((excerpt) => excerpt.path)).toContain(`${VIDEO_DIR}/transcript.md`);
  });

  it('says honestly that nothing was found when only the function words match', async () => {
    const fixture = await chatsFixture();

    const answer = await askQuestion(fixture.deps(emptyGateway()), {
      question: 'Was machen die Zitronenfalter und wie sind sie?',
    });

    expect(answer.excerpts).toEqual([]);
    expect(answer.unsupported).toBe(true);
    expect(answer.answer).toBe('Dazu steht nichts im Vault.');
  });
});
