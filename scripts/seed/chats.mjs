/* Ein beantwortetes Gespräch im Demo-Vault (`.secondbrain/chats/`).

   Warum es hier steht: der Fragen-Screen hat zwei Zustände, die man sehen muss.
   Ohne Modell zeigt er die Fundstellen — das entsteht beim Aufnehmen selbst.
   Eine **belegte Antwort in Prosa** entsteht dagegen nur mit Modell, und der
   Demo-Vault trägt bewusst keinen Provider. Also liegt hier eine Runde, die
   früher einmal beantwortet wurde: Frage, Antwort, drei geprüfte Belege.

   Die Belege sind nicht erfunden: Zitat und Zeilennummer werden aus den gerade
   geschriebenen Dateien gelesen. Zeigt der Screen `datei.md:17`, steht das Zitat
   dort auch. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** So viele Zeilen weit darf ein Zitat laufen — wie im Kern (`wiki/citations`). */
const WINDOW = 4;
const ANCHOR_CHARS = 40;

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Die 1-basierte Zeile, in der ein Zitat beginnt. Gesucht wird wie im Kern: das
 * späteste Fenster, das den Anfang noch enthält.
 */
function lineOfQuote(content, quote) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const anchor = collapse(quote).slice(0, ANCHOR_CHARS);
  let found = null;
  for (let index = 0; index < lines.length; index += 1) {
    const window = collapse(lines.slice(index, index + WINDOW).join(' '));
    if (window.includes(anchor)) found = index;
    else if (found !== null) break;
  }
  if (found === null) throw new Error(`Zitat steht nicht in der Datei: "${quote.slice(0, 40)}…"`);
  return found + 1;
}

/** Ein Beleg, aus der Datei gelesen — Pfad, Titel, Zitat, Zeile. */
function citation(seeder, path, title, quote) {
  const content = readFileSync(join(seeder.root, path), 'utf8');
  return { path, title, quote, line: lineOfQuote(content, quote) };
}

export function seedChats(seeder, clock) {
  const module = 'identity-management';
  const blog = `s-${clock.day(-6)}-token-lifetimes-blog`;
  const page = (name) => `modules/${module}/wiki/${name}`;

  const citations = [
    citation(
      seeder,
      page('concepts/token-lebensdauer.md'),
      'Token-Lebensdauer',
      'Aktueller Stand: Access-Token 15 Minuten, Refresh-Token 8 Stunden mit Rotation bei jeder Nutzung',
    ),
    citation(
      seeder,
      page(`sources/${blog}.md`),
      'Blogartikel: Kurze Token, weniger Ärger',
      'Der befürchtete Anstieg der Anfragen blieb aus: plus 4 % auf den Token-Endpunkt.',
    ),
    citation(
      seeder,
      page('concepts/altes-token-konzept.md'),
      'Altes Token-Konzept (Erstprojekt)',
      'Access-Token 12 Stunden, Refresh-Token 30 Tage, keine Rotation.',
    ),
  ];

  const question = 'Wie lange leben unsere Access-Token?';
  const answer = [
    `Access-Token leben 15 Minuten, Refresh-Token 8 Stunden, und die Refresh-Token rotieren bei jeder Nutzung [[${citations[0].path}]].`,
    '',
    `Der befürchtete Anstieg der Anfragen auf den Token-Endpunkt blieb aus — im Praxisbericht plus 4 % [[${citations[1].path}]].`,
    '',
    `Aus dem Erstprojekt steht ein älterer Stand daneben: „Access-Token 12 Stunden, Refresh-Token 30 Tage, keine Rotation." [[${citations[2].path}]]. Er ist als überholt markiert und bleibt stehen.`,
  ].join('\n');

  const id = `c-${clock.stamp(-1, '10:42')}-demo`;
  const messageId = `m-${clock.stamp(-1, '10:42')}-demo`;
  const asked = clock.at(-1, '10:42');
  const answered = clock.at(-1, '10:43');

  seeder.json(
    `.secondbrain/chats/${id}.json`,
    {
      version: 1,
      id,
      kind: 'ask',
      title: question,
      created: asked,
      updated: answered,
      context: module,
      messages: [
        { id: `${messageId}-q`, role: 'user', content: question, at: asked },
        {
          id: messageId,
          role: 'assistant',
          content: answer,
          at: answered,
          model: 'qwen2.5:14b',
          citations,
        },
      ],
    },
    clock.date(-1, '10:43'),
  );
  seeder.bump('chats');
}
