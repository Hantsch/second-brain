/* „Kein Modell konfiguriert" als Zustand, nicht als Fehler: sagt, welche
   Aufgabe ein Modell bräuchte, und führt direkt in die Routing-Einstellung.
   Alles, was ohne Modell geht, bleibt daneben benutzbar.

   Zwei Tonlagen: `card` für Screens, deren Inhalt ohne Modell nicht existiert,
   und `note` für Screens, die auch ohne Modell etwas zu tun haben — dort darf der
   Hinweis dem eigentlichen Fokuspunkt nicht die Aufmerksamkeit nehmen.

   Das Ziel ist der Modelle-Tab, nicht die Einstellungen allgemein: „Routing
   einrichten" muss in der Routing-Tabelle landen, sonst sucht der Nutzer weiter. */

import { useNavigate } from 'react-router-dom';
import type { TaskKind } from '@shared/types';
import { Button } from '../atoms/Button';
import { Card } from '../atoms/Card';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';

/** Der Tab, in dem das Routing wirklich steht (`SettingsScreen` liest `?tab`). */
const ROUTING_ROUTE = '/settings?tab=models';

export interface LlmMissingProps {
  /** Aufgabe, für die eine Route fehlt. */
  task: TaskKind;
  tone?: 'card' | 'note';
}

export function LlmMissing({ task, tone = 'card' }: LlmMissingProps) {
  const t = useT();
  const navigate = useNavigate();

  if (tone === 'note') {
    return (
      <p className="sb-llm-note">
        <Icon name="info" size={14} />
        <span>{t(`llm.note.${task}`)}</span>
        {/* Textlink, kein Knopf: der eine Teal-Fokuspunkt des Screens liegt
            woanders. */}
        <button type="button" className="sb-textlink" onClick={() => void navigate(ROUTING_ROUTE)}>
          {t('llm.note.action')}
        </button>
      </p>
    );
  }

  return (
    <Card padded={false} className="sb-empty-card">
      <div className="sb-empty">
        <span className="sb-empty-icon">
          <Icon name="sparkles" size={20} />
        </span>
        <h2 className="sb-empty-title">{t('llm.missing.title')}</h2>
        <p className="sb-empty-body">{t('llm.missing.body', { task: t(`task.${task}.label`) })}</p>
        <Button
          variant="secondary"
          icon="sliders-horizontal"
          onClick={() => void navigate(ROUTING_ROUTE)}
        >
          {t('llm.missing.action')}
        </Button>
      </div>
    </Card>
  );
}
