/* The filed trail — story 006, D5.
 *
 * Since D4 stopped deleting a filed dump, it stays under `inbox/` as its own
 * receipt: `status: 'filed'`, `filed_into`, `filed_at`. `UnfiledWorkspace`
 * keeps those out of the keyboard-driven working list above (they are not
 * unfiled work); this section is where they become visible instead — proof
 * of where the content went, not a second to-do list.
 *
 * Collapsed by default, unlike `AreaSection`'s areas: a receipt is looked up
 * occasionally, not read every time this screen opens.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DumpItem, KnowledgeModule, Project } from '@shared/types';
import { Button } from '../../atoms/Button';
import { Panel } from '../../components/Panel';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import { leafOf, targetFor } from '../garden/targets';

export interface FiledTrailProps {
  dumps: readonly DumpItem[];
  names: { projects: Project[]; modules: KnowledgeModule[] };
}

/** Newest receipt first. `filedAt` is `YYYY-MM-DD`, so a plain string
    comparison sorts correctly without parsing a date. A dump without it
    (shouldn't happen once `status` is `filed`) sorts last. */
function byFiledAtDesc(a: DumpItem, b: DumpItem): number {
  if (a.filedAt === null) return b.filedAt === null ? 0 : 1;
  if (b.filedAt === null) return -1;
  return b.filedAt.localeCompare(a.filedAt);
}

/** A human title for the receipt's target, not the raw path. Projects match
    by path directly; a module path is `modules/<slug>/wiki/...`, so the slug
    is pulled out and matched against the module list. Falls back to the
    bare file name — never a path full of slashes as the primary label. */
function targetName(path: string, names: FiledTrailProps['names']): string {
  const project = names.projects.find((entry) => entry.path === path);
  if (project !== undefined) return project.title;
  const moduleSlug = /^modules\/([^/]+)\//.exec(path)?.[1];
  const module =
    moduleSlug === undefined ? undefined : names.modules.find((entry) => entry.slug === moduleSlug);
  if (module !== undefined) return module.title;
  return leafOf(path);
}

export function FiledTrail({ dumps, names }: FiledTrailProps) {
  const t = useT();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  /* Absent, not present-with-zero: a vault with nothing filed yet shouldn't
     carry a permanent, empty "Filed" header. */
  if (dumps.length === 0) return null;

  const sorted = [...dumps].sort(byFiledAtDesc);

  /* Same pattern as `GardenScreen`'s `openPath`: `targetFor()` is the one
     resolver for "where does this path lead in the app", reused here rather
     than duplicated, per the story's own decision. */
  const openTarget = (path: string): void => {
    const target = targetFor(path);
    if (target.kind === 'route') void navigate(target.to);
    else void api.shell.openPath(target.path).catch(() => undefined);
  };

  return (
    <div className="sb-filedtrail">
      <Panel
        title={t('notes.unfiled.filedTitle')}
        meta={t('notes.unfiled.filedCount', { count: dumps.length })}
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={open ? 'chevron-up' : 'chevron-down'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {t(open ? 'notes.unfiled.hide' : 'notes.unfiled.show')}
          </Button>
        }
      >
        {!open ? null : (
          <ul className="sb-filedlist" aria-label={t('notes.unfiled.filedTitle')}>
            {sorted.map((dump) => {
              const filedInto = dump.filedInto;
              return (
                <li key={dump.path} className="sb-filedrow">
                  <span className="sb-filedrow-title">{dump.title}</span>
                  {filedInto === null ? null : (
                    <button
                      type="button"
                      className="sb-textlink"
                      onClick={() => openTarget(filedInto)}
                    >
                      {t('notes.unfiled.filedInto', { target: targetName(filedInto, names) })}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
