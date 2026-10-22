/* "Commands": what can be typed into the Claude session the header button opens. The
   Gaston commands are the skills the agent setup installs; whether they are installed
   is the setup notice's to say. */

import { HELP_MODULE_SLUG } from '@shared/help-module';
import { AGENT_DIRS, AGENT_SKILLS } from '@shared/types';
import { Panel } from '../../components/Panel';
import { useT } from '../../i18n';
import { useModules } from '../../lib/queries/data';

interface CommandRow {
  command: string;
  /** The argument placeholder, translated because it is read, not typed. */
  argKey?: string;
  descriptionKey: string;
  /** The folder the command works in, filled into the description. */
  dir?: string;
}

const GASTON_COMMANDS: readonly CommandRow[] = [
  {
    command: `/${AGENT_SKILLS.curate}`,
    argKey: 'agent.commands.curateArg',
    descriptionKey: 'agent.commands.curate',
  },
  {
    command: `/${AGENT_SKILLS.propose}`,
    descriptionKey: 'agent.commands.propose',
    dir: AGENT_DIRS.proposals,
  },
  { command: `/${AGENT_SKILLS.jobs}`, descriptionKey: 'agent.commands.jobs', dir: AGENT_DIRS.jobs },
];

const CLAUDE_COMMANDS: readonly CommandRow[] = [
  { command: '/model', descriptionKey: 'agent.commands.model' },
  { command: '/help', descriptionKey: 'agent.commands.help' },
];

export function AgentCommandsPanel() {
  const t = useT();
  /* The help module is read-only by convention, so it is not offered for curating. */
  const slugs = (useModules().data ?? [])
    .map((module) => module.slug)
    .filter((slug) => slug !== HELP_MODULE_SLUG);

  const renderRows = (rows: readonly CommandRow[]) => (
    <dl className="sb-agent-commands">
      {rows.map((row) => (
        <div key={row.command} className="sb-agent-command">
          <dt className="sb-mono">
            {row.argKey === undefined ? row.command : `${row.command} ${t(row.argKey)}`}
          </dt>
          <dd>
            {row.dir === undefined
              ? t(row.descriptionKey)
              : t(row.descriptionKey, { dir: row.dir })}
            {row.argKey !== undefined && slugs.length > 0 ? (
              <span className="sb-agent-command-modules">
                {t('agent.commands.modules')} <span className="sb-mono">{slugs.join(', ')}</span>
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <Panel title={t('agent.commands.title')}>
      <div className="sb-setting-block">
        <p>{t('agent.commands.intro')}</p>
        <div className="sb-agent-group">
          <span className="gs-label">{t('agent.commands.gaston')}</span>
          {renderRows(GASTON_COMMANDS)}
        </div>
        <div className="sb-agent-group">
          <span className="gs-label">{t('agent.commands.claude')}</span>
          {renderRows(CLAUDE_COMMANDS)}
        </div>
      </div>
    </Panel>
  );
}
