/* The shared "discard this page" action (story 015 D7).
 *
 * A button named after the file it would discard — never "discard this" when
 * two pages sit on one card — that opens a dialog. The dialog fetches the
 * discard plan fresh every time it opens (015 D6's `discardPlan`): the plan
 * must reflect the file as it stands right now, not whatever a card rendered
 * a minute ago. Nothing is written before the explicit confirm click.
 *
 * Two shapes, one component:
 * - A surviving page is given (`keep`) and the plan actually has inbound
 *   links to repoint → a pre-checked checkbox offers the repoint.
 * - No surviving page (the orphan case story 016 reuses this for) → no
 *   checkbox; if links point at the page, the dialog says plainly that they
 *   would break, since nothing here repoints them.
 *
 * What happens after a successful discard is the caller's decision — this
 * component only reports the result through `onDone`, the same "the caller
 * writes and reports it" split `ContradictionCard`'s `onSupersede` uses. */

import { useState } from 'react';
import { Button } from '../atoms/Button';
import { Checkbox } from '../atoms/Checkbox';
import { Dialog } from '../atoms/Dialog';
import { useT } from '../i18n';
import type { DiscardPageResult, DiscardPlanResult } from '../lib/queries/gardener';
import { useGardenerMutations } from '../lib/queries/gardener';
import { plural } from '../lib/format';
import { leafOf } from '../screens/garden/targets';
import { ErrorState } from './ErrorState';
import { Skeleton } from './Skeleton';

export interface DiscardPageTarget {
  path: string;
  /** Not read by this component today — carried for callers that already have it. */
  slug?: string;
}

export interface DiscardPageActionProps {
  /** The page the action would discard. */
  target: DiscardPageTarget;
  /**
   * The surviving page, when there is one to repoint inbound links at. Its
   * absence (the orphan case) is what turns the repoint checkbox into a
   * plain "these links would break" sentence.
   */
  keep?: DiscardPageTarget;
  /** Another action on the same card is running — mirrors `FindingCard`'s `busy`. */
  busy?: boolean;
  /** Runs after a successful discard; the caller decides what to show for it. */
  onDone?: (result: DiscardPageResult) => void;
}

export function DiscardPageAction({ target, keep, busy = false, onDone }: DiscardPageActionProps) {
  const t = useT();
  const mutations = useGardenerMutations();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<DiscardPlanResult | null>(null);
  const [repoint, setRepoint] = useState(true);

  const fileName = leafOf(target.path);

  const openDialog = (): void => {
    setPlan(null);
    setOpen(true);
    mutations.discardPlan.mutate(
      { path: target.path, ...(keep === undefined ? {} : { keep: keep.path }) },
      {
        onSuccess: (result) => {
          setPlan(result);
          setRepoint(true);
        },
      },
    );
  };

  const close = (): void => setOpen(false);

  const confirm = (): void => {
    if (plan === null) return;
    const withKeep = keep !== undefined && repoint && plan.repoints.length > 0;
    mutations.discardPage.mutate(
      {
        path: target.path,
        expectedHash: plan.target.hash,
        ...(withKeep && keep !== undefined ? { keep: keep.path } : {}),
      },
      {
        onSuccess: (result) => {
          setOpen(false);
          onDone?.(result);
        },
      },
    );
  };

  const planPending = mutations.discardPlan.isPending;
  const planFailed = plan === null && !planPending ? mutations.discardPlan.error : null;
  const canRepoint = keep !== undefined && plan !== null && plan.repoints.length > 0;
  const willBreak = keep === undefined && plan !== null && plan.inbound.length > 0;

  return (
    <>
      <Button variant="secondary" size="sm" icon="trash-2" loading={busy} onClick={openDialog}>
        {t('garden.discard.action', { file: fileName })}
      </Button>

      <Dialog
        open={open}
        onClose={close}
        size="sm"
        title={t('garden.discard.title', { file: fileName })}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              icon="trash-2"
              disabled={plan === null}
              loading={mutations.discardPage.isPending}
              onClick={confirm}
            >
              {t('garden.discard.confirm')}
            </Button>
          </>
        }
      >
        {planPending ? (
          <Skeleton lines={3} height={16} />
        ) : planFailed !== null ? (
          <ErrorState
            error={planFailed}
            onRetry={openDialog}
            variant="secondary"
            subject={fileName}
          />
        ) : plan === null ? null : (
          <div className="sb-discard">
            <p className="sb-finding-note">
              {plan.inbound.length === 0
                ? t('garden.discard.inboundNone')
                : plural(
                    plan.inbound.length,
                    'garden.discard.inboundOne',
                    'garden.discard.inboundMany',
                  )}
            </p>

            {plan.catalogLine === null ? (
              <p className="sb-finding-note">{t('garden.discard.catalogNone')}</p>
            ) : (
              <>
                <p className="sb-finding-note">{t('garden.discard.catalogPreview')}</p>
                <pre className="sb-finding-preview sb-mono">
                  <code>{`- ${plan.catalogLine}`}</code>
                </pre>
              </>
            )}

            {canRepoint ? (
              <Checkbox
                label={t('garden.discard.repoint', { file: leafOf(keep?.path ?? '') })}
                checked={repoint}
                onChange={(event) => setRepoint(event.target.checked)}
              />
            ) : willBreak ? (
              <p className="sb-finding-note">{t('garden.discard.willBreak')}</p>
            ) : null}
          </div>
        )}

        {mutations.discardPage.error === null ? null : (
          <ErrorState error={mutations.discardPage.error} variant="secondary" subject={fileName} />
        )}
      </Dialog>
    </>
  );
}
