// @vitest-environment jsdom
/* A settled agent job is a record: the reason stays on the row and nothing offers to take
   the job back. */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AgentJobView } from '@shared/types';
import { AgentJobRow } from '@renderer/screens/tasks/AgentJobRow';
import { setLanguage } from '@renderer/i18n';

function job(patch: Partial<AgentJobView>): AgentJobView {
  return {
    id: 'job-1',
    kind: 'condense-source',
    subject: 'raw/text/2026/example.md',
    label: 'Example source',
    module: 'second-brain-methodik',
    state: 'failed',
    reason: 'transcript unreadable',
    createdAt: '2026-10-27T10:00:00.000Z',
    finishedAt: '2026-10-27T10:05:00.000Z',
    ...patch,
  };
}

describe('AgentJobRow', () => {
  it('a failed agent job shows its reason and offers no withdraw', () => {
    setLanguage('en');
    render(<AgentJobRow job={job({})} onWithdraw={vi.fn()} />);

    expect(screen.getByText('Failed')).toBeTruthy();
    expect(screen.getByText('Reason: transcript unreadable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Withdraw' })).toBeNull();
  });

  it('an open agent job offers to withdraw it', () => {
    setLanguage('en');
    const onWithdraw = vi.fn();
    render(
      <AgentJobRow job={job({ state: 'with-agent', reason: null })} onWithdraw={onWithdraw} />,
    );

    screen.getByRole('button', { name: 'Withdraw' }).click();
    expect(onWithdraw).toHaveBeenCalledWith('job-1');
  });
});
