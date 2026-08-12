/* Der Leerzustand des Fragens: drei Fragen, die zu diesem Vault passen.

   Nicht hartcodiert — sie entstehen aus dem, was im Vault liegt: ein Modul, ein
   Projekt, ein Warte-auf. Eine Beispielfrage über ein Modul, das es nicht gibt,
   wäre eine Enttäuschung mit einem Klick Abstand.

   Ist der Vault noch leer, gibt es keine Beispiele, sondern den Weg, ihn zu
   füllen — dafür sorgt der Screen. */

import type { KnowledgeModule, Project } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { t as translate, useT } from '../../i18n';

/** So viele Beispiele stehen da. Mehr sind eine Liste, keine Anregung. */
const MAX_EXAMPLES = 3;

/**
 * Fragen aus dem Bestand. Reihenfolge nach Nutzen: Wissen zuerst (dafür ist der
 * Screen da), dann der Wiedereinstieg, dann das Warten.
 */
export function exampleQuestions(
  projects: readonly Project[],
  modules: readonly KnowledgeModule[],
): string[] {
  const questions: string[] = [];
  const module = modules.find((entry) => entry.counts.concepts + entry.counts.entities > 0);
  if (module !== undefined) {
    questions.push(translate('ask.example.module', { title: module.title }));
  }
  const project = projects.find((entry) => entry.status === 'active') ?? projects[0];
  if (project !== undefined) {
    questions.push(translate('ask.example.project', { title: project.title }));
  }
  const waiting = projects.find((entry) => entry.waitingOn.length > 0);
  if (waiting !== undefined) {
    const first = waiting.waitingOn[0];
    if (first !== undefined) questions.push(translate('ask.example.waiting', { who: first.who }));
  }
  const other = modules.find((entry) => entry.slug !== module?.slug);
  if (other !== undefined) questions.push(translate('ask.example.module', { title: other.title }));
  return [...new Set(questions)].slice(0, MAX_EXAMPLES);
}

export interface ExamplesProps {
  projects: readonly Project[];
  modules: readonly KnowledgeModule[];
  onPick: (question: string) => void;
}

export function Examples({ projects, modules, onPick }: ExamplesProps) {
  const t = useT();
  const questions = exampleQuestions(projects, modules);
  if (questions.length === 0) return null;

  return (
    <div className="sb-examples">
      <span className="gs-overline">{t('ask.examples.title')}</span>
      <ul className="sb-examplelist" aria-label={t('ask.examples.title')}>
        {questions.map((question) => (
          <li key={question}>
            <button type="button" className="sb-example" onClick={() => onPick(question)}>
              <Icon name="sparkles" size={14} />
              <span>{question}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
