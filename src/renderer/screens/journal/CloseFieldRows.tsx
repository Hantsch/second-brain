/* People, projects, tags and mood/energy on the day close-out card (075, D4).
 *
 * People, projects and tags mirror the areas row (036, D3): a single
 * all-or-nothing checkbox forces a correction on the whole list even when the
 * model got two names right and one wrong, so each item is its own removable
 * chip instead. People and tags have no closed vocabulary in the vault, so
 * only projects also get an add-picker, built from the same `projects` prop
 * `CloseTodoRow`'s target picker already uses — there is no second data
 * source for "which projects exist".
 *
 * Mood and energy are not lists, so they keep their per-field keep/drop
 * checkbox from before this deliverable, but the group as a whole now always
 * renders (never gated by whether the suggestion proposed a value): hiding
 * the picker exactly when the model found nothing would hide the one place a
 * user could still set a mood or energy the model never saw. Picking a level
 * re-ticks the field's own keep box in the same `patch` call — a user who
 * deliberately picks a value clearly wants it kept, and a picked value the
 * keep box then dropped again would be a silent no-op the user could not
 * explain from the screen alone.
 */

import type { JournalFrontmatterFields, Project } from '@shared/types';
import { Checkbox } from '../../atoms/Checkbox';
import { Select } from '../../atoms/Select';
import { Tag } from '../../atoms/Tag';
import { MoodPicker } from '../../components/MoodPicker';
import { useT } from '../../i18n';
import { patch } from '../../lib/close-proposal';

export interface CloseFieldRowsProps {
  date: string;
  /** `payloadOf`'s own resolution — corrections already applied, mood/energy
   * already collapsed to `null` when their keep box is unticked. */
  frontmatter: JournalFrontmatterFields;
  /** `edits.keepField`, needed whole (not just the two booleans this
   * component reads) so a re-tick can merge without dropping another field's
   * keep state. */
  keepField: Record<string, boolean>;
  /** Vault-known projects, for the projects add-picker. */
  projects: readonly Project[];
}

interface ChipFieldProps {
  legend: string;
  items: string[];
  emptyLabel: string;
  removeLabelOf: (item: string) => string;
  onRemove: (item: string) => void;
}

/** One chip row: the areas row's own shape (036, D3), reused verbatim for
 * people, projects and tags. Whatever renders after the chips (an add-picker,
 * or nothing) is the caller's business. */
function ChipField({ legend, items, emptyLabel, removeLabelOf, onRemove }: ChipFieldProps) {
  return items.length === 0 ? (
    <p className="sb-panel-empty">{emptyLabel}</p>
  ) : (
    <span className="sb-chips" role="group" aria-label={legend}>
      {items.map((item) => (
        <Tag key={item} onRemove={() => onRemove(item)} removeLabel={removeLabelOf(item)}>
          {item}
        </Tag>
      ))}
    </span>
  );
}

export function CloseFieldRows({ date, frontmatter, keepField, projects }: CloseFieldRowsProps) {
  const t = useT();
  const { people, projects: projectSlugs, tags, mood, energy } = frontmatter;
  const keeps = (key: string): boolean => keepField[key] !== false;

  const removePerson = (name: string): void => {
    patch(date, { people: people.filter((existing) => existing !== name) });
  };
  const removeProject = (slug: string): void => {
    patch(date, { projects: projectSlugs.filter((existing) => existing !== slug) });
  };
  const addProject = (slug: string): void => {
    if (slug.length === 0 || projectSlugs.includes(slug)) return;
    patch(date, { projects: [...projectSlugs, slug] });
  };
  const removeTag = (tag: string): void => {
    patch(date, { tags: tags.filter((existing) => existing !== tag) });
  };
  const pickableProjects = projects.filter((project) => !projectSlugs.includes(project.slug));
  const projectTitle = (slug: string): string =>
    projects.find((project) => project.slug === slug)?.title ?? slug;

  const setField = (key: string, keep: boolean): void => {
    patch(date, { keepField: { ...keepField, [key]: keep } });
  };
  const pickMood = (level: number): void => {
    patch(date, { mood: level, keepField: { ...keepField, mood: true } });
  };
  const pickEnergy = (level: number): void => {
    patch(date, { energy: level, keepField: { ...keepField, energy: true } });
  };
  /** Reuses `journal.close.mood`/`.energy`'s existing `{label}` slot: "not
   * set" when nothing is picked yet, the level's own name once one is. */
  const levelLabel = (kind: 'mood' | 'energy', value: number | null): string =>
    value === null ? t('journal.level.none') : t(`journal.${kind}.${value}`);

  return (
    <>
      <fieldset className="sb-proposal-group">
        <legend className="gs-label">{t('journal.close.people')}</legend>
        <ChipField
          legend={t('journal.close.people')}
          items={people}
          emptyLabel={t('journal.close.people.empty')}
          removeLabelOf={(name) => t('journal.close.people.removeOf', { name })}
          onRemove={removePerson}
        />
      </fieldset>

      <fieldset className="sb-proposal-group">
        <legend className="gs-label">{t('journal.close.projects')}</legend>
        <ChipField
          legend={t('journal.close.projects')}
          items={projectSlugs}
          emptyLabel={t('journal.close.projects.empty')}
          removeLabelOf={(slug) =>
            t('journal.close.projects.removeOf', { title: projectTitle(slug) })
          }
          onRemove={removeProject}
        />
        {pickableProjects.length === 0 ? null : (
          <Select
            aria-label={t('journal.close.projects.addLabel')}
            placeholder={t('journal.close.projects.addPlaceholder')}
            value=""
            onChange={(event) => addProject(event.target.value)}
            options={pickableProjects.map((project) => ({
              value: project.slug,
              label: project.title,
            }))}
          />
        )}
      </fieldset>

      <fieldset className="sb-proposal-group">
        <legend className="gs-label">{t('journal.close.tags')}</legend>
        <ChipField
          legend={t('journal.close.tags')}
          items={tags}
          emptyLabel={t('journal.close.tags.empty')}
          removeLabelOf={(tag) => t('journal.close.tags.removeOf', { tag })}
          onRemove={removeTag}
        />
      </fieldset>

      <fieldset className="sb-proposal-group">
        <legend className="gs-label">{t('journal.close.moodEnergy')}</legend>
        <div className="sb-todoedit-row">
          <Checkbox
            checked={keeps('mood')}
            label={t('journal.close.mood', { label: levelLabel('mood', mood) })}
            onChange={(event) => setField('mood', event.target.checked)}
          />
          <MoodPicker kind="mood" value={mood} onPick={pickMood} />
        </div>
        <div className="sb-todoedit-row">
          <Checkbox
            checked={keeps('energy')}
            label={t('journal.close.energy', { label: levelLabel('energy', energy) })}
            onChange={(event) => setField('energy', event.target.checked)}
          />
          <MoodPicker kind="energy" value={energy} onPick={pickEnergy} />
        </div>
      </fieldset>
    </>
  );
}
