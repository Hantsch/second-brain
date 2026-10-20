/* English UI texts for the chats screen. Same key set as `de-chats.ts` —
   enforced by tests/renderer/i18n.test.ts. Sentence case, no emoji. */

export const enChats = {
  'screen.chats.overline': 'What I asked',
  'screen.chats.title': 'Chats',
  'screen.chats.empty.title': 'No chat yet',
  'screen.chats.empty.body':
    'Questions to Gaston are kept here as a history. The first question starts the first chat.',
  'screen.chats.pick': 'Pick a chat on the left to read it.',
  'chats.continue': 'Continue in chat',
} as const;
