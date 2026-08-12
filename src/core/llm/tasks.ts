/* Der Katalog aller LLM-Aufgaben. Eine Aufgabe = eine Kategorie, die der Nutzer
   einem Provider/Modell zuordnet. Die Empfehlungen folgen der Tabelle in
   docs/CONCEPT.md („LLM: kategorisiert, wählbar, ehrlich").

   Die Texte selbst liegen nicht hier, sondern in `src/renderer/i18n/` unter den
   Keys `task.<kind>.label` und `task.<kind>.hint` — der Kern kennt keine
   Oberflächensprache. */

import type { ModelTier, TaskDefinition, TaskKind } from '@shared/types';

/** Reihenfolge, in der die Aufgaben in den Einstellungen erscheinen. */
export const TASK_KINDS: readonly TaskKind[] = [
  'title-tags',
  'classify-dump',
  'extract-tasks',
  'query-answer',
  'query-rerank',
  'summarize-source',
  'wiki-ingest',
  'journal-chat',
  'project-status',
  'gardener-audit',
];

function definition(
  kind: TaskKind,
  suggested: ModelTier,
  flags: { sensitive?: boolean; streams?: boolean; structured?: boolean } = {},
): TaskDefinition {
  return {
    kind,
    labelKey: `task.${kind}.label`,
    hintKey: `task.${kind}.hint`,
    suggested,
    sensitive: flags.sensitive === true,
    streams: flags.streams === true,
    structured: flags.structured === true,
  };
}

/**
 * Alle Aufgaben mit Empfehlung und Charakter:
 * - `sensitive`: läuft über persönliche Inhalte → lokale Modelle bevorzugen.
 * - `streams`: Chat-Charakter, Antwort läuft stückweise in die Oberfläche.
 * - `structured`: Antwort ist JSON gegen ein Schema, nicht Prosa.
 */
export const TASK_DEFINITIONS: readonly TaskDefinition[] = [
  // Ein Satz Ausgabe — ein großes Modell wäre Verschwendung.
  definition('title-tags', 'cheap', { structured: true }),
  // Persönlicher Inhalt, einfache Entscheidung: klein und lokal.
  definition('classify-dump', 'cheap', { sensitive: true, structured: true }),
  // Strukturierte Extraktion aus persönlichem Text.
  definition('extract-tasks', 'cheap', { sensitive: true, structured: true }),
  // Muss Belege korrekt zusammenführen und streamt in den Ask-Screen.
  definition('query-answer', 'balanced', { streams: true }),
  // Nur sortieren: kurze Liste von IDs, kein Fließtext.
  definition('query-rerank', 'cheap', { structured: true }),
  // Länger, aber geradeaus.
  definition('summarize-source', 'balanced'),
  // Verknüpfen, Widersprüche erkennen, Bestand verändern.
  definition('wiki-ingest', 'strong'),
  // Das Sensibelste, was es hier gibt — und ein Gespräch.
  definition('journal-chat', 'balanced', { sensitive: true, streams: true }),
  // Urteil über eine Projekthistorie, als Vorschlag.
  definition('project-status', 'balanced', { structured: true }),
  // Urteil über den ganzen Bestand.
  definition('gardener-audit', 'strong', { structured: true }),
];

const BY_KIND = new Map<TaskKind, TaskDefinition>(TASK_DEFINITIONS.map((t) => [t.kind, t]));

/** Definition einer Aufgabe. Wirft, wenn der Katalog eine Aufgabe nicht kennt. */
export function taskDefinition(kind: TaskKind): TaskDefinition {
  const found = BY_KIND.get(kind);
  if (!found) throw new Error(`Unbekannte LLM-Aufgabe: ${kind}`);
  return found;
}

/** Empfohlene Leistungsklasse — die Grundlage für `defaults[tier]` im Routing. */
export function suggestedTier(kind: TaskKind): ModelTier {
  return taskDefinition(kind).suggested;
}

/** Aufgaben, die nur lokal laufen sollten, weil sie persönliche Inhalte lesen. */
export function sensitiveTasks(): TaskKind[] {
  return TASK_DEFINITIONS.filter((t) => t.sensitive).map((t) => t.kind);
}
