/* Die ganze Kette einmal echt: Dateien auf der Platte → Index → Claude-Spuren →
   Dashboard. Das ist der Test, der die Nahtstellen prüft, die die Einzeltests
   jeweils wegabstrahieren:

   - `IndexService` erfüllt `OverviewIndex` strukturell (die Naht zum Main),
   - eine Claude-Sitzung wird über `repos` einem Projekt zugeordnet und schlägt
     als `lastTouch` die Dateiänderung,
   - `externalTouches` als lebendige Map: der Main füllt sie nach dem Öffnen und
     lässt den Index nachziehen — genau der Weg, den die Shell gehen muss.

   Gelesen wird nur der Fixture-Bestand: ein Temp-Vault und
   `tests/fixtures/claude/`, nie das echte `~/.claude`. */

import { describe, expect, it } from 'vitest';
import type { ExternalTouch } from '@core/index/types';
import { IndexService } from '@core/index/service';
import { ClaudeSessionReader, linkSessions, nodeClaudeFileSystem, pathKey } from '@core/claude';
import { dashboardData, recentWork, reminders, suggestProjectStatus } from '@core/overview';
import type { OverviewIndex } from '@core/overview';
import { createEmptyGateway } from '../../fakes/llm';
import { CLAUDE_PROJECTS_DIR } from '../../fixtures';
import { NOW_MS, TODAY } from '../../helpers/time';
import { withTempVault } from '../../helpers/vault';

const LIMITS = { staleAfterDays: 14, deadlineHorizonDays: 14, waitingNudgeDays: 5 };

/** `IndexService` als `OverviewIndex` — vom Typprüfer bewacht, nicht behauptet. */
const asOverviewIndex = (service: IndexService): OverviewIndex => service;

describe('Überblick auf echten Dateien', () => {
  it('führt Index, Claude-Spuren und Dashboard zusammen', async () => {
    await withTempVault(
      async (vault) => {
        // Die Projektdateien sind fünf Tage alt; die Sitzung von heute ist jünger.
        await vault.touch('projects/work/kundenportal-relaunch/project.md', -5);
        await vault.touch('projects/private/hochbeet-bauen/project.md', -5);

        const touches = new Map<string, ExternalTouch>();
        const service = await IndexService.open(vault.store, {
          now: () => new Date(NOW_MS),
          persistence: null,
          externalTouches: touches,
        });
        const index = asOverviewIndex(service);

        const reader = new ClaudeSessionReader({
          fs: nodeClaudeFileSystem(),
          projectsDir: CLAUDE_PROJECTS_DIR,
        });
        const linking = linkSessions(await reader.list(), index.projects());

        // Die Sitzung im Repo des Projekts ist zugeordnet, die übrigen nicht.
        expect(linking.sessions.find((s) => s.id === 'session-kundenportal')?.vaultProject).toBe(
          'kundenportal-relaunch',
        );
        expect(linking.unlinked).toHaveLength(2);

        // Der Main füllt die lebendige Map und lässt den Index nachziehen.
        for (const [slug, touch] of linking.touches) touches.set(slug, touch);
        await service.rebuild();

        const project = index
          .projects()
          .find((candidate) => candidate.slug === 'kundenportal-relaunch');
        expect(project?.lastTouchSource).toBe('claude-session');
        expect(project?.lastTouch).toBe('2026-08-10T08:43:55.000Z');

        // Die echte Sitzungsliste kommt als `ClaudeSession`; das Dashboard braucht
        // die gemeinsame Agenten-Form mit `agent` und `projectKey`.
        const agentSessions = linking.sessions.map((s) => ({
          ...s,
          agent: 'claude' as const,
          projectKey: pathKey(s.cwd),
        }));

        const data = dashboardData(index, agentSessions, LIMITS, TODAY);

        // Todos getrennt nach Bereich, beide Seiten gefüllt.
        expect(data.todos.work.length).toBeGreaterThan(0);
        expect(data.todos.private.length).toBeGreaterThan(0);
        expect(data.todos.work.every((todo) => todo.scope === 'work')).toBe(true);

        // Warte-auf mit Projektbezug.
        expect(data.waitingOn[0]).toMatchObject({
          who: 'Jonas',
          project: 'kundenportal-relaunch',
          path: 'projects/work/kundenportal-relaunch/project.md',
        });

        // Fristen aus Todo und Projekt-Deadline, überfälliges zuerst.
        expect(data.reminders.length).toBeGreaterThan(0);
        expect(data.reminders[0]?.urgency).toBe('overdue');
        expect(new Set(data.reminders.map((entry) => entry.source))).toContain('project-deadline');

        // Zuletzt gearbeitet: Dateien, Sitzungen, Journal und die Rohquelle.
        expect(new Set(data.recentWork.map((item) => item.kind))).toEqual(
          new Set(['file', 'claude-session', 'journal', 'ingest']),
        );

        // Inbox und Journal-Serie kommen aus dem Bestand.
        expect(data.inboxCount).toBe(1);
        expect(data.journal.lastEntry).toBe(TODAY);
        expect(data.journal.streak).toBe(1);

        // Kein Pflegelauf: die Zahl wird nicht behauptet.
        expect(data.healthKnown).toBe(false);

        // Und der Statusvorschlag ohne Modell nennt den Beleg aus der Datei.
        const suggestion = await suggestProjectStatus(
          { index, gateway: createEmptyGateway(), today: TODAY, settings: LIMITS },
          'kundenportal-relaunch',
        );
        expect(suggestion).toMatchObject({ status: 'waiting', heuristic: true });
        expect(suggestion?.reason).toContain('Jonas');

        // Dieselben Zahlen auch über die Einzelaufrufe.
        expect(reminders(index, LIMITS, TODAY)).toEqual(data.reminders);
        expect(recentWork(index, agentSessions, { now: TODAY })).toEqual(data.recentWork);
      },
      { sample: true },
    );
  });
});
