/* Der YouTube-Ordner unter `raw/youtube/<video-id>/`. Aufbau wie in ../yougrab:
   metadata.md, metadata.json, transcript.md (Prosa, für den Ingest),
   transcript.timestamped.md (zitierfähig, mit Deep-Links) — dazu das Protokoll
   `.ingest.json` aus docs/VAULT-FORMAT.md.

   Kanal, Titel und Transkript sind erfunden. Die beiden Zitate hier sind
   dieselben, die die Wiki-Quellseite belegt: darum steht die Zeitmarke im
   Transkript und in der Seite an derselben Stelle.

   Ein zweites Video (Story 051, D7) ist absichtlich ohne Transcript: eine
   Aufzeichnung ohne Untertitel, wie sie der echte Ingest antrifft, wenn
   yt-dlp keine Spur liefert. `renderProseTranscript`
   (`src/core/ingest/youtube/transcript.ts:198`) schreibt in diesem Fall nur
   die Platzhalterzeile — genau das bildet `seedYoutubeNoTranscript` nach, statt
   den echten Ingest-Code hier zu importieren (der Seed bleibt ein reines
   Node-Skript, siehe `scripts/seed/lib.mjs`). Beschreibung und Kapitel bleiben
   vollständig, damit der „aus Beschreibung verdichten“-Pfad echten Text zum
   Verdichten hat. */

const VIDEO_ID = 'xOFkpf9KgKg';
const VIDEO_TITLE = 'Your AI Second Brain Is Slowly Rotting';
const CHANNEL = 'Knowledge Systems Lab';
const CHANNEL_ID = 'UCdemo0000KnowledgeSystems';

/** Prosa-Transkript: Kapitel mit Zeitmarke, wie es der Ingest verdichtet. */
const CHAPTERS = [
  {
    start: 0,
    title: 'Warum Sammlungen verfallen',
    cues: [
      [0, 'Your notes are not a library. Left alone, they are a landfill.'],
      [
        18,
        'Every tool that fills your vault automatically fills it faster than you can read it, and that gap is where rot starts.',
      ],
      [
        41,
        'I went through my own vault last month: eleven hundred notes, and forty of them had ever been opened twice.',
      ],
    ],
  },
  {
    start: 412,
    title: 'Die drei Verfallsformen',
    cues: [
      [412, 'There are exactly three ways a knowledge base rots, and you can measure all of them.'],
      [432, 'An unmaintained knowledge base is a landfill with good intentions.'],
      [
        458,
        'Orphans: pages nothing links to. Stale claims: statements nobody checked after the world moved. Duplicates: two pages arguing about the same word.',
      ],
    ],
  },
  {
    start: 690,
    title: 'Was dagegen hilft',
    cues: [
      [
        690,
        'The fix is boring: a recurring maintenance pass that shows you findings you can act on.',
      ],
      [708, 'If you cannot cite it, you do not know it.'],
      [
        742,
        'Summarize on the way in, not on the way out. Two sentences you would defend beat twenty pages you will never reopen.',
      ],
    ],
  },
];

function clockStamp(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(rest)}`;
}

function shortStamp(seconds) {
  return clockStamp(seconds).slice(3);
}

function prose() {
  const lines = [];
  for (const chapter of CHAPTERS) {
    lines.push(`## ${shortStamp(chapter.start)} — ${chapter.title}`, '');
    lines.push(chapter.cues.map(([, text]) => text).join(' '), '');
  }
  return lines.join('\n');
}

function timestamped() {
  const lines = [];
  for (const chapter of CHAPTERS) {
    lines.push(`## ${shortStamp(chapter.start)} — ${chapter.title}`, '');
    for (const [at, text] of chapter.cues) {
      lines.push(`- [\`${clockStamp(at)}\`](https://youtu.be/${VIDEO_ID}?t=${at}) ${text}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function wordCount(text) {
  return text.split(/\s+/).filter((word) => word.length > 0).length;
}

export function seedYoutube(seeder, clock) {
  seedYoutubeCondensed(seeder, clock);
  seedYoutubeNoTranscript(seeder, clock);
}

function seedYoutubeCondensed(seeder, clock) {
  const dir = `raw/youtube/${VIDEO_ID}`;
  const proseText = prose();
  const words = wordCount(proseText);
  const cues = CHAPTERS.reduce((sum, chapter) => sum + chapter.cues.length, 0);
  const grabbed = clock.at(-9, '21:34');
  const when = clock.date(-9, '21:34');
  const shared = {
    video_id: VIDEO_ID,
    title: VIDEO_TITLE,
    channel: CHANNEL,
    url: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  };

  seeder.doc(
    `${dir}/metadata.md`,
    {
      ...shared,
      channel_id: CHANNEL_ID,
      channel_url: `https://www.youtube.com/channel/${CHANNEL_ID}`,
      doc_type: 'video-metadata',
      published: clock.day(-13),
      published_at: clock.at(-13, '17:00'),
      duration_seconds: 1084,
      duration: '18m 04s',
      view_count: 41208,
      like_count: 2317,
      language: 'en',
      tags: ['second brain', 'note taking', 'knowledge management', 'obsidian'],
      chapter_count: CHAPTERS.length,
      transcript_available: true,
      transcript_language: 'en',
      transcript_kind: 'manual',
      transcript_provider: 'yt-dlp',
      transcript_word_count: words,
      metadata_providers: ['yt-dlp'],
      grabbed_at: grabbed,
    },
    `# ${VIDEO_TITLE}

- **Kanal:** [${CHANNEL}](https://www.youtube.com/channel/${CHANNEL_ID})
- **Veroeffentlicht:** ${clock.day(-13)}
- **Dauer:** 18m 04s
- **Video:** https://www.youtube.com/watch?v=${VIDEO_ID}
- **Transcript:** \`transcript.md\` (en, manual)

## Description

Eighteen minutes on why automatically filled note vaults decay, how to measure the
decay, and the one habit that stops it. Chapters: why collections rot, the three
kinds of rot, what actually helps.

## Chapters

${CHAPTERS.map((chapter) => `- ${shortStamp(chapter.start)} ${chapter.title}`).join('\n')}`,
    when,
  );

  seeder.json(
    `${dir}/metadata.json`,
    {
      videoId: VIDEO_ID,
      title: VIDEO_TITLE,
      description:
        'Eighteen minutes on why automatically filled note vaults decay, how to measure the decay, and the one habit that stops it.',
      channel: CHANNEL,
      channelId: CHANNEL_ID,
      channelUrl: `https://www.youtube.com/channel/${CHANNEL_ID}`,
      publishedAt: clock.at(-13, '17:00'),
      durationSeconds: 1084,
      viewCount: 41208,
      likeCount: 2317,
      language: 'en',
      tags: ['second brain', 'note taking', 'knowledge management', 'obsidian'],
      chapters: CHAPTERS.map((chapter) => ({ start: chapter.start, title: chapter.title })),
      transcript: {
        available: true,
        language: 'en',
        kind: 'manual',
        provider: 'yt-dlp',
        wordCount: words,
        cueCount: cues,
      },
      grabbedAt: grabbed,
    },
    when,
  );

  const transcriptFields = {
    ...shared,
    doc_type: 'transcript',
    transcript_language: 'en',
    transcript_kind: 'manual',
    transcript_provider: 'yt-dlp',
    duration_seconds: 1084,
  };

  seeder.doc(
    `${dir}/transcript.md`,
    { ...transcriptFields, transcript_style: 'prose', word_count: words, cue_count: cues },
    `# ${VIDEO_TITLE} — Transcript\n\n${proseText}`,
    when,
  );

  seeder.doc(
    `${dir}/transcript.timestamped.md`,
    { ...transcriptFields, transcript_style: 'timestamped' },
    `# ${VIDEO_TITLE} — Transcript (timestamped)\n\n${timestamped()}`,
    when,
  );

  seeder.json(
    `${dir}/.ingest.json`,
    {
      kind: 'youtube',
      origin: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      ingestedAt: grabbed,
      title: VIDEO_TITLE,
      sourcePage: `s-${clock.day(-9)}-ai-second-brain-rotting`,
      modules: ['second-brain-methodik'],
      provenance: { transcript: 'yt-dlp', metadata: 'yt-dlp' },
    },
    when,
  );
  seeder.bump('raw');
  seeder.bump('rawProcessed');
}

/* ── Zweites Video: kein Transcript (Story 051) ─────────────────────────── */

const VIDEO_ID_2 = 'zQPz9x2LKrT';
const VIDEO_TITLE_2 = 'Live AMA: Why We Killed Our Wiki Bot';
const CHANNEL_2 = CHANNEL;
const CHANNEL_ID_2 = CHANNEL_ID;

/** Nur Zeit und Titel — der Stream hat keine Untertitel, also keine Cues. */
const CHAPTERS_2 = [
  { start: 0, title: 'Warm-up und Technikcheck' },
  { start: 180, title: 'Warum der Wiki-Bot abgeschaltet wurde' },
  { start: 960, title: 'Fragen aus dem Chat' },
];

const DESCRIPTION_2 =
  'Ungeschnittener Livestream, 42 Minuten, ohne Untertitel. Ich erkläre, warum wir den ' +
  'automatischen Wiki-Bot abgeschaltet haben, bevor er die Sammlung stillschweigend mit ' +
  'falschen Verknüpfungen gefüllt hätte: er zog Seiten aus Stichwörtern statt aus Belegen, ' +
  'und niemand hätte es gemerkt, bis ein Zitat nicht mehr stimmte. Kapitel: Warm-up, die ' +
  'Abschaltung selbst, Fragen aus dem Chat.';

/**
 * Ein Video ohne Transcript: kein `transcript.timestamped.md`, `transcript.md` nur mit der
 * Platzhalterzeile (`cue_count: 0`, wie `renderProseTranscript` sie fuer leere Cues schreibt),
 * `.ingest.json` mit `transcript.available: false` — davon leitet `blockedReasonOf`
 * (`src/core/index/pages.ts`) `blocked: 'no-transcript'` ab. `metadata.md`/`metadata.json`
 * tragen Description und Kapitel vollstaendig, damit „aus Beschreibung verdichten“ echten
 * Text zum Verdichten hat (AC2/AC3).
 */
function seedYoutubeNoTranscript(seeder, clock) {
  const dir = `raw/youtube/${VIDEO_ID_2}`;
  const grabbed = clock.at(-6, '19:05');
  const when = clock.date(-6, '19:05');
  const shared = {
    video_id: VIDEO_ID_2,
    title: VIDEO_TITLE_2,
    channel: CHANNEL_2,
    url: `https://www.youtube.com/watch?v=${VIDEO_ID_2}`,
  };

  seeder.doc(
    `${dir}/metadata.md`,
    {
      ...shared,
      channel_id: CHANNEL_ID_2,
      channel_url: `https://www.youtube.com/channel/${CHANNEL_ID_2}`,
      doc_type: 'video-metadata',
      published: clock.day(-6),
      published_at: grabbed,
      duration_seconds: 2520,
      duration: '42m 00s',
      view_count: 908,
      like_count: 61,
      language: 'en',
      tags: ['second brain', 'livestream', 'ama'],
      chapter_count: CHAPTERS_2.length,
      transcript_available: false,
      transcript_language: null,
      transcript_kind: null,
      transcript_provider: null,
      transcript_word_count: null,
      metadata_providers: ['yt-dlp'],
      grabbed_at: grabbed,
    },
    `# ${VIDEO_TITLE_2}

- **Kanal:** [${CHANNEL_2}](https://www.youtube.com/channel/${CHANNEL_ID_2})
- **Veroeffentlicht:** ${clock.day(-6)}
- **Dauer:** 42m 00s
- **Video:** https://www.youtube.com/watch?v=${VIDEO_ID_2}
- **Transcript:** nicht verfuegbar

## Description

${DESCRIPTION_2}

## Chapters

${CHAPTERS_2.map((chapter) => `- ${shortStamp(chapter.start)} ${chapter.title}`).join('\n')}`,
    when,
  );

  seeder.json(
    `${dir}/metadata.json`,
    {
      videoId: VIDEO_ID_2,
      title: VIDEO_TITLE_2,
      description: DESCRIPTION_2,
      channel: CHANNEL_2,
      channelId: CHANNEL_ID_2,
      channelUrl: `https://www.youtube.com/channel/${CHANNEL_ID_2}`,
      publishedAt: grabbed,
      durationSeconds: 2520,
      viewCount: 908,
      likeCount: 61,
      language: 'en',
      tags: ['second brain', 'livestream', 'ama'],
      chapters: CHAPTERS_2.map((chapter) => ({ start: chapter.start, title: chapter.title })),
      transcript: {
        available: false,
        language: null,
        kind: null,
        provider: null,
        wordCount: null,
        cueCount: null,
      },
      grabbedAt: grabbed,
    },
    when,
  );

  /* Platzhalter, wie `renderProseTranscript` ihn fuer `cues.length === 0` schreibt
     (`src/core/ingest/youtube/transcript.ts:198`) — keine `transcript.timestamped.md`
     daneben, weil es ohne Cues auch dort nichts zu zitieren gibt. */
  seeder.doc(
    `${dir}/transcript.md`,
    {
      doc_type: 'transcript',
      video_id: VIDEO_ID_2,
      title: VIDEO_TITLE_2,
      channel: CHANNEL_2,
      url: `https://www.youtube.com/watch?v=${VIDEO_ID_2}`,
      transcript_language: null,
      transcript_kind: null,
      transcript_provider: null,
      duration_seconds: 2520,
      transcript_style: 'prose',
      word_count: 0,
      cue_count: 0,
    },
    `# ${VIDEO_TITLE_2} — Transcript\n\n_Kein Transcript verfuegbar._`,
    when,
  );

  seeder.json(
    `${dir}/.ingest.json`,
    {
      kind: 'youtube',
      origin: `https://www.youtube.com/watch?v=${VIDEO_ID_2}`,
      ingestedAt: grabbed,
      title: VIDEO_TITLE_2,
      sourcePage: null,
      modules: ['second-brain-methodik'],
      provenance: { metadata: 'yt-dlp' },
      transcript: {
        available: false,
        language: null,
        kind: null,
        provider: null,
        wordCount: null,
        cueCount: null,
      },
    },
    when,
  );
  seeder.bump('raw');
  seeder.bump('rawUnprocessed');
}
