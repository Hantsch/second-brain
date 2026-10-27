/* The condensed tab of a module. Like the area and project tabs, the
   behaviour lives in `CondensedUnitPanel`; this says which unit it is, which
   routing entry a run needs and where the copy comes from. No delete: a
   module's overview page is part of the module, not a derived artefact next
   to it, and `condense:delete` refuses the module level. The module can also
   be handed to the agent, which answers with the same kind of proposal. */

import { HandOverCondenseButton } from '../../components/AgentHandOverActions';
import { CondensedUnitPanel } from '../../components/condensed/CondensedUnitPanel';
import { useCondenseWithAgent } from '../../lib/queries/agent-jobs';

export interface ModuleCondensedTabProps {
  module: { slug: string; title: string };
}

export function ModuleCondensedTab({ module }: ModuleCondensedTabProps) {
  const agentOpen = useCondenseWithAgent(module.slug);
  return (
    <CondensedUnitPanel
      unit="module"
      slug={module.slug}
      title={module.title}
      task="condense-module"
      keyPrefix="modules.condensed"
      canDelete={false}
      agentAction={<HandOverCondenseButton slug={module.slug} />}
      agentOpen={agentOpen}
    />
  );
}
