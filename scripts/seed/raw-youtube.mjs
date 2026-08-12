/* Der YouTube-Ordner unter `raw/youtube/<video-id>/`. Aufbau wie in ../yougrab:
   metadata.md, metadata.json, transcript.md (Prosa, für den Ingest),
   transcript.timestamped.md (zitierfähig, mit Deep-Links) — dazu das Protokoll
   `.ingest.json` aus docs/VAULT-FORMAT.md.

   Kanal, Titel und Transkript sind erfunden. Die beiden Zitate hier sind
   dieselben, die die Wiki-Quellseite belegt: darum steht die Zeitmarke im
   Transkript und in der Seite an derselben Stelle. */

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
