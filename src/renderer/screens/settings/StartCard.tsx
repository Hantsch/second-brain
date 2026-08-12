/* The onboarding for a user who doesn't have a model yet.

   Three paths, each with one sentence explaining what it means — and below
   that, this machine's findings: is a local runtime already running here?
   If Ollama or LM Studio answers, this shows the number of models found and
   a button that adopts the connection. If nothing answers, the guide is
   shown instead of a shrug.

   The card only appears while no provider is configured. */

import { Button } from '../../atoms/Button';
import { Card } from '../../atoms/Card';
import { Icon } from '../../atoms/Icon';
import { Spinner } from '../../atoms/Spinner';
import { useT } from '../../i18n';
import { api } from '../../lib/api';
import type { LocalRuntime } from '../../lib/queries/llm';

const OLLAMA_URL = 'https://ollama.com';

export interface StartCardProps {
  runtimes: readonly LocalRuntime[] | undefined;
  checking: boolean;
  failed: boolean;
  onRecheck: () => void;
  onAdopt: (runtime: LocalRuntime) => void;
  onAddProvider: () => void;
  onSkip: () => void;
  adopting: boolean;
}

function foundKey(runtime: LocalRuntime): string {
  if (runtime.models.length === 0) return 'settings.detect.foundEmpty';
  return runtime.models.length === 1 ? 'settings.detect.foundOne' : 'settings.detect.found';
}

export function StartCard({
  runtimes,
  checking,
  failed,
  onRecheck,
  onAdopt,
  onAddProvider,
  onSkip,
  adopting,
}: StartCardProps) {
  const t = useT();
  const running = (runtimes ?? []).filter((runtime) => runtime.running);
  /* One focus point per screen: if there is something to adopt, the teal
     belongs to adopting — otherwise it belongs to adding manually. */
  const adoptable = running.some((runtime) => !runtime.configured && runtime.models.length > 0);

  return (
    <Card className="sb-start">
      <h2 className="sb-start-title">{t('settings.models.start.title')}</h2>
      <p className="sb-start-body">{t('settings.models.start.body')}</p>

      <ul className="sb-start-ways">
        <li>
          <span className="sb-start-way">{t('settings.models.start.local.title')}</span>
          <span className="sb-start-hint">{t('settings.models.start.local.body')}</span>
        </li>
        <li>
          <span className="sb-start-way">{t('settings.models.start.cloud.title')}</span>
          <span className="sb-start-hint">{t('settings.models.start.cloud.body')}</span>
        </li>
        <li>
          <span className="sb-start-way">{t('settings.models.start.none.title')}</span>
          <span className="sb-start-hint">{t('settings.models.start.none.body')}</span>
        </li>
      </ul>

      <div className="sb-start-detect">
        <span className="gs-overline">{t('settings.detect.title')}</span>
        {checking ? (
          <p className="sb-start-hint">
            <Spinner size={14} label={t('common.loading')} /> {t('settings.detect.checking')}
          </p>
        ) : failed ? (
          <p className="sb-start-hint">{t('settings.detect.failed')}</p>
        ) : running.length > 0 ? (
          running.map((runtime) => (
            <div key={runtime.presetId} className="sb-start-found">
              <p>
                {runtime.configured
                  ? t('settings.detect.configured', { label: runtime.label })
                  : t(foundKey(runtime), { label: runtime.label, count: runtime.models.length })}
              </p>
              {!runtime.configured && runtime.models.length > 0 ? (
                <Button size="sm" icon="check" loading={adopting} onClick={() => onAdopt(runtime)}>
                  {t('settings.detect.adopt')}
                </Button>
              ) : null}
              <p className="sb-mono">{runtime.baseUrl}</p>
            </div>
          ))
        ) : (
          <div className="sb-start-found">
            <p>{t('settings.detect.none')}</p>
            <p className="sb-start-hint">{t('settings.detect.guide')}</p>
            <p className="sb-mono">{t('settings.detect.command')}</p>
            <div className="sb-setting-actions">
              <Button
                variant="secondary"
                size="sm"
                icon="external-link"
                onClick={() => void api.shell.openExternal(OLLAMA_URL).catch(() => undefined)}
              >
                {t('settings.detect.guideLink')}
              </Button>
              <Button variant="ghost" size="sm" icon="refresh-cw" onClick={onRecheck}>
                {t('settings.detect.recheck')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="sb-setting-actions">
        <Button variant={adoptable ? 'secondary' : 'primary'} icon="plus" onClick={onAddProvider}>
          {t('settings.providers.add')}
        </Button>
        <button type="button" className="sb-textlink" onClick={onSkip}>
          {t('settings.models.start.none.action')}
          <Icon name="arrow-right" size={13} />
        </button>
      </div>
    </Card>
  );
}
