/* Einstellungen — hier wird die App erst scharf.

   Sechs Tabs, in der Reihenfolge, in der ein Nutzer sie braucht: wo liegen meine
   Dateien (Vault), in welcher Sprache (Sprachen), welches Modell macht was
   (Modelle), wie verhält sich die App (Verhalten), wie sieht sie aus
   (Anpassung), und was läuft hier eigentlich (Info). Der Agent ist ein eigener
   Screen; der alte Tab-Link leitet dorthin weiter.

   Der Tab steht in der Adresse (`#/settings?tab=models`), damit ein Hinweis aus
   einem anderen Screen direkt hierher zeigen kann. Geschrieben wird sie erst
   beim Umschalten — beim Öffnen bleibt `#/settings` unverändert. */

import { Navigate, useSearchParams } from 'react-router-dom';
import { Tabs } from '../../atoms/Tabs';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useT } from '../../i18n';
import { AboutTab } from './AboutTab';
import { BehaviorTab } from './BehaviorTab';
import { CustomizationTab } from './CustomizationTab';
import { LanguagesTab } from './LanguagesTab';
import { ModelsTab } from './ModelsTab';
import { VaultTab } from './VaultTab';

const TAB_IDS = ['vault', 'languages', 'models', 'behavior', 'customization', 'about'] as const;

type TabId = (typeof TAB_IDS)[number];

const TAB_ICONS: Record<TabId, string> = {
  vault: 'database',
  languages: 'globe',
  models: 'sparkles',
  behavior: 'sliders-horizontal',
  customization: 'palette',
  about: 'info',
};

const TAB_LABELS: Record<TabId, string> = {
  vault: 'settings.vault',
  languages: 'settings.tab.languages',
  models: 'settings.tab.models',
  behavior: 'settings.tab.behavior',
  customization: 'settings.tab.customization',
  about: 'settings.tab.about',
};

function isTabId(value: string | null): value is TabId {
  return value !== null && (TAB_IDS as readonly string[]).includes(value);
}

export function SettingsScreen() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = isTabId(requested) ? requested : 'vault';

  if (requested === 'agent') return <Navigate to="/agent" replace />;

  return (
    <div className="sb-screen">
      <ScreenHeader overline={t('screen.settings.overline')} title={t('screen.settings.title')} />
      <Tabs
        items={TAB_IDS.map((id) => ({ id, label: t(TAB_LABELS[id]), icon: TAB_ICONS[id] }))}
        value={tab}
        onChange={(id) => setParams({ tab: id }, { replace: true })}
      />
      {tab === 'vault' ? <VaultTab /> : null}
      {tab === 'languages' ? <LanguagesTab /> : null}
      {tab === 'models' ? <ModelsTab /> : null}
      {tab === 'behavior' ? <BehaviorTab /> : null}
      {tab === 'customization' ? <CustomizationTab /> : null}
      {tab === 'about' ? <AboutTab /> : null}
    </div>
  );
}
