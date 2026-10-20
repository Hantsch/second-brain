/* What changed in the running version. Missing notes are a statement, never a
   blank panel: the user is told there is nothing to show and still gets the
   links to the full changelog. */

import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '../../../components/EmptyState';
import { Panel } from '../../../components/Panel';
import { Skeleton } from '../../../components/Skeleton';
import { useT } from '../../../i18n';
import { api } from '../../../lib/api';
import { qk } from '../../../lib/queries/keys';
import { AboutLinks } from './AboutLinks';
import { ReleaseNotesBody } from './ReleaseNotesBody';

export function InstalledNotesPanel() {
  const t = useT();
  const notes = useQuery({ queryKey: qk.app.releaseNotes(), queryFn: api.app.releaseNotes });

  if (notes.isPending) {
    return (
      <Panel title={t('settings.about.notes.loading')}>
        <Skeleton lines={3} height={20} />
      </Panel>
    );
  }

  const markdown = notes.data?.markdown?.trim() ?? '';
  if (markdown.length === 0) {
    return (
      <>
        <EmptyState
          icon="file-text"
          title={t('settings.about.notes.empty.title')}
          body={t('settings.about.notes.empty.body')}
        />
        <AboutLinks />
      </>
    );
  }

  return (
    <Panel title={t('settings.about.notes.title', { version: notes.data?.version ?? '' })}>
      <ReleaseNotesBody markdown={markdown} />
      <AboutLinks />
    </Panel>
  );
}
