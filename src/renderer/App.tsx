/* Router und Weichen. Ohne Vault sieht der Nutzer das Onboarding — sonst die
   Hülle mit der Rail. Die UI-Sprache folgt den Einstellungen. */

import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { TitleBar } from './components/TitleBar';
import { ToastHost } from './components/ToastHost';
import { setLanguage } from './i18n';
import { api } from './lib/api';
import { backgroundImage } from './lib/customization-assets';
import { qk } from './lib/queries/keys';
import { AgentsScreen } from './screens/agents/AgentsScreen';
import { AskScreen } from './screens/ask/AskScreen';
import { CaptureScreen } from './screens/capture/CaptureScreen';
import { DashboardScreen } from './screens/dashboard/DashboardScreen';
import { GardenScreen } from './screens/garden/GardenScreen';
import { InboxScreen } from './screens/inbox/InboxScreen';
import { JournalScreen } from './screens/journal/JournalScreen';
import { ModulesScreen } from './screens/modules/ModulesScreen';
import { OnboardingScreen } from './screens/onboarding/OnboardingScreen';
import { ProjectsScreen } from './screens/projects/ProjectsScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';

/** Hält die Oberflächensprache an den Einstellungen. */
function useSettings() {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  useEffect(() => {
    if (!data) return;
    setLanguage(data.vault?.languages.ui ?? data.app.uiLanguage);
  }, [data]);
  return data;
}

/** Redirect onto the knowledge screen that keeps the query string.

    `<Navigate to="/knowledge" />` would drop it, and every deep link into a
    module (`#/modules?m=…&tab=log&p=…`) would silently land on the overview.
    Without `tab` the search is carried over verbatim; with it the old
    `/sources` route is merged into the knowledge screen's sources tab. */
function KnowledgeRedirect({ tab }: { tab?: string }) {
  const { search } = useLocation();
  if (tab === undefined) return <Navigate to={`/knowledge${search}`} replace />;
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return <Navigate to={`/knowledge?${params.toString()}`} replace />;
}

export function App() {
  const settings = useSettings();
  const location = useLocation();
  const { data: status, isPending } = useQuery({
    queryKey: qk.vault.status(),
    queryFn: api.vault.status,
  });

  const onboarding = location.pathname === '/onboarding';
  const noVault = !isPending && (status?.root ?? null) === null;
  const customization = settings?.app.customization ?? {
    background: 'none' as const,
    appIcon: 'knowledge-garden' as const,
  };

  /* Auch ohne Vault braucht das rahmenlose Fenster seine Titelzeile. */
  if (onboarding || noVault) {
    return (
      <div className="sb-app">
        <TitleBar appIcon={customization.appIcon} />
        <div
          className={
            customization.background === 'none'
              ? 'sb-content'
              : 'sb-content sb-content--custom-background'
          }
          style={
            {
              '--sb-custom-background': backgroundImage(customization.background),
            } as CSSProperties
          }
        >
          <OnboardingScreen />
        </div>
        <ToastHost />
      </div>
    );
  }

  return (
    <AppShell background={customization.background} appIcon={customization.appIcon}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardScreen />} />
        <Route path="/capture" element={<CaptureScreen />} />
        <Route path="/inbox" element={<InboxScreen />} />
        <Route path="/ask" element={<AskScreen />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/journal" element={<JournalScreen />} />
        <Route path="/knowledge" element={<ModulesScreen />} />
        {/* Old routes, kept so existing deep links and bookmarks still land. */}
        <Route path="/modules" element={<KnowledgeRedirect />} />
        <Route path="/sources" element={<KnowledgeRedirect tab="sources" />} />
        <Route path="/garden" element={<GardenScreen />} />
        <Route path="/agents" element={<AgentsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
