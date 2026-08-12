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
import { SourcesScreen } from './screens/sources/SourcesScreen';

/** Hält die Oberflächensprache an den Einstellungen. */
function useSettings() {
  const { data } = useQuery({ queryKey: qk.settings.snapshot(), queryFn: api.settings.get });
  useEffect(() => {
    if (!data) return;
    setLanguage(data.vault?.languages.ui ?? data.app.uiLanguage);
  }, [data]);
  return data;
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
        <Route path="/modules" element={<ModulesScreen />} />
        <Route path="/sources" element={<SourcesScreen />} />
        <Route path="/garden" element={<GardenScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
