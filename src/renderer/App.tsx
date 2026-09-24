/* Router und Weichen. Ohne Vault sieht der Nutzer das Onboarding — sonst die
   Hülle mit der Rail. Die UI-Sprache folgt den Einstellungen. */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from './components/AppShell';
import { TitleBar } from './components/TitleBar';
import { ToastHost } from './components/ToastHost';
import { setLanguage } from './i18n';
import { api } from './lib/api';
import { backgroundImage } from './lib/customization-assets';
import { qk } from './lib/queries/keys';
import type { ShellOverlay } from './lib/shell-overlays';
import { useShellOverlays } from './lib/shell-overlays';
import { DashboardScreen } from './screens/dashboard/DashboardScreen';
import { GardenScreen } from './screens/garden/GardenScreen';
import { JournalScreen } from './screens/journal/JournalScreen';
import { ModulesScreen } from './screens/modules/ModulesScreen';
import { NotesScreen } from './screens/notes/NotesScreen';
import { OnboardingScreen } from './screens/onboarding/OnboardingScreen';
import { AllSessionsScreen } from './screens/projects/AllSessionsScreen';
import { ProjectsScreen } from './screens/projects/ProjectsScreen';
import { ReaderScreen } from './screens/reader/ReaderScreen';
import { SearchScreen } from './screens/search/SearchScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { TasksScreen } from './screens/tasks/TasksScreen';

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

/** Redirect off the old inbox address onto Notes' unfiled filter.

    Inbox stopped being a place of its own (story 006): what used to live at
    `/inbox` is now the unfiled filter on Notes. The address stays reachable —
    tiles, capture and old bookmarks still point at it — so it must arrive
    with its query string intact and with `filter=unfiled` added. A bare
    `<Navigate to="/notes?filter=unfiled" />` would drop whatever else the
    address carried (`#/inbox?x=1` would land without `x`), so `search` is
    read here, while this route still is the location, merged with the one
    fixed param the destination needs. */
function UnfiledRedirect() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('filter', 'unfiled');
  return <Navigate to={`/notes?${params.toString()}`} replace />;
}

/** Redirect off the old all-sessions address that keeps the query string.

    The view moved under Projects (story 008), but `#/agents?a=codex&p=<key>&s=<id>`
    lives on in bookmarks, in the dashboard tile and in every transcript link
    handed around so far. `<Navigate to="/projects/sessions" />` would drop
    `search`, so those links would arrive without `a`/`p`/`s` and land on the
    bare project list instead of the transcript they name — a silent
    regression, not a visible error. So `search` is read here, while this
    route still is the location, and appended verbatim: nothing is rebuilt,
    nothing can go missing. */
function AgentsRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/projects/sessions${search}`} replace />;
}

/** Route that opens a shell overlay and hands the address back.

    Capture and ask are no longer screens, but their addresses stay: the
    dashboard tiles, the inbox and old bookmarks point at them. So the route
    does what the address asks for — open the overlay — and then sends the URL
    on to the dashboard, the app's default route, so the overlay lies over a
    screen instead of over nothing.

    Why the query string is read here and not left to `<Navigate>`: `<Navigate
    to="/dashboard" replace />` drops `search`, so `#/ask?q=…` would arrive
    without its question. `q` is therefore taken from the location while this
    route still is the location, and handed to the opener.

    The route only fills the field. It never sets `submit` — the rule the ask
    screen carried before it: a URL is not a user action, so asking stays the
    user's move. */
function OpenOverlayRoute({ kind }: { kind: ShellOverlay }) {
  const [params] = useSearchParams();
  const { openCapture, openAsk } = useShellOverlays();
  const opened = useRef(false);
  /* Capture has no `q`: `#/capture?q=…` means nothing, so it is ignored. */
  const question = params.get('q') ?? '';

  /* The ref makes this a one-off: StrictMode invokes effects twice, and the
     overlay must not be reopened after the user closed it. */
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (kind === 'capture') openCapture();
    else openAsk(question.length > 0 ? { question } : undefined);
  }, [kind, question, openCapture, openAsk]);

  return <Navigate to="/dashboard" replace />;
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
        <Route path="/inbox" element={<UnfiledRedirect />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        {/* Nested under Projects on purpose: the rail entry stays lit through
            the `NavLink` prefix match. */}
        <Route path="/projects/sessions" element={<AllSessionsScreen />} />
        <Route path="/notes" element={<NotesScreen />} />
        <Route path="/journal" element={<JournalScreen />} />
        <Route path="/knowledge" element={<ModulesScreen />} />
        {/* The generic reading view (059, D4) — where a document with no
            dedicated home (`homeOf`'s fallback) opens. */}
        <Route path="/read" element={<ReaderScreen />} />
        {/* The full search result view (059, D5) — a route, not a rail entry,
            so the address carries query and filters through Back/reload. */}
        <Route path="/search" element={<SearchScreen />} />
        {/* Capture and ask live as overlays inside the shell; these addresses
            open them over the dashboard instead of leading to a screen. */}
        <Route path="/capture" element={<OpenOverlayRoute kind="capture" />} />
        <Route path="/ask" element={<OpenOverlayRoute kind="ask" />} />
        {/* Old routes, kept so existing deep links and bookmarks still land. */}
        <Route path="/modules" element={<KnowledgeRedirect />} />
        <Route path="/sources" element={<KnowledgeRedirect tab="sources" />} />
        {/* Sits directly above maintenance in the rail's system group. */}
        <Route path="/tasks" element={<TasksScreen />} />
        <Route path="/garden" element={<GardenScreen />} />
        <Route path="/agents" element={<AgentsRedirect />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}
