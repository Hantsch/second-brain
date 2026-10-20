/* Deutsche UI-Texte für den Chats-Screen. Gleicher Schlüsselsatz wie
   `en-chats.ts` — erzwungen von tests/renderer/i18n.test.ts. Satzschreibung,
   kein Emoji. */

export const deChats = {
  'screen.chats.overline': 'Was ich gefragt habe',
  'screen.chats.title': 'Chats',
  'screen.chats.empty.title': 'Noch kein Chat',
  'screen.chats.empty.body':
    'Fragen an Gaston landen hier als Verlauf. Die erste Frage legt den ersten Chat an.',
  'screen.chats.pick': 'Wähle links einen Chat, um ihn zu lesen.',
  'chats.continue': 'Im Chat weiterfragen',
} as const;
