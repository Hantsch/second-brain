/* The knowledge tab of a project (story 045, D4). Mirrors `AreaCondensedTab`:
   the level-agnostic behaviour lives in `CondensedUnitPanel`, this component
   only says which unit it is looking at, which routing entry a run of it
   needs, and where its copy comes from. It stays a named component rather
   than being replaced by the panel at the call site: `ProjectDetail`
   addresses the knowledge tab, not the panel, and the project's own
   `condense-project` task and `project.condensed.*` copy are decided here. */

import { CondensedUnitPanel } from '../../components/condensed/CondensedUnitPanel';

export interface ProjectKnowledgeTabProps {
  project: { slug: string; title: string };
}

export function ProjectKnowledgeTab({ project }: ProjectKnowledgeTabProps) {
  return (
    <CondensedUnitPanel
      unit="project"
      slug={project.slug}
      title={project.title}
      task="condense-project"
      keyPrefix="project.condensed"
    />
  );
}
