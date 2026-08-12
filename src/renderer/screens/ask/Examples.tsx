/* The empty state of asking: three questions that fit this vault.

   Not hardcoded — they're derived from what's actually in the vault: a
   knowledge module, a project, a waiting-on. An example question about a
   module that doesn't exist would be a disappointment one click away.

   If the vault is still empty, there are no examples, only a path to fill it —
   the screen takes care of that. */

import type { KnowledgeModule, Project } from '@shared/types';
import { Icon } from '../../atoms/Icon';
import { t as translate, useT } from '../../i18n';

/** This many examples are shown. More would be a list, not a nudge. */
const MAX_EXAMPLES = 3;

/**
 * Questions drawn from what's on hand. Ordered by usefulness: knowledge first
 * (that's what this screen is for), then getting back into a project, then
 * waiting-on.
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
