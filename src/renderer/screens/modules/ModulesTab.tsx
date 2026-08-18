/* The modules tab: one card per knowledge module.

   Its own component because the states it owns are the tab's, not the
   screen's: a vault without modules is empty *here* — on the sources tab
   next to it there is plenty to do, which is exactly where you go to fill
   this one. A screen-wide empty state would have locked that door.

   The focal point is "create module": without a module there is nothing to
   read here. */

import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { useT } from '../../i18n';
import { plural } from '../../lib/format';
import { useModules } from '../../lib/queries/data';
import { ModuleCards } from './ModuleCards';

export interface ModulesTabProps {
  onOpen: (slug: string) => void;
  /** Opens the create dialog — it belongs to the screen, not to this tab. */
  onCreate: () => void;
}

export function ModulesTab({ onOpen, onCreate }: ModulesTabProps) {
  const t = useT();
  /* The same query the screen reads to resolve `?m=`; the cache answers both. */
  const { data, error, isPending, refetch } = useModules();

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  if (isPending || data === undefined) return <Skeleton lines={4} height={44} />;

  if (data.length === 0) {
    return (
      <EmptyState
        icon="network"
        title={t('screen.knowledge.empty.title')}
        body={t('screen.knowledge.empty.body')}
        action={{
          label: t('screen.knowledge.empty.action'),
          icon: 'plus',
          onClick: onCreate,
        }}
      />
    );
  }

  return (
    <>
      {/* No second frame titled "modules": that already sits in the header.
          The counter appears here as a mono number, like "5 dumps" in the
          inbox or "9 projects" in projects. */}
      <p className="sb-modules-count sb-mono">
        {plural(data.length, 'modules.countOne', 'modules.count')}
      </p>
      <ModuleCards modules={data} onOpen={onOpen} />
    </>
  );
}
