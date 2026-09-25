/* The module detail header's action area (story 063).
 *
 * D5 gave it one action, rename; D6 adds delete right next to it without
 * restructuring this file — each action owns its own open/dialog state side
 * by side, the same shape `ModuleDetail.tsx` already uses for its own dialog
 * (`SourceDetailDialog`, keyed to force a clean remount on open). */

import { useState } from 'react';
import type { KnowledgeModule } from '@shared/types';
import { Button } from '../../atoms/Button';
import { useT } from '../../i18n';
import { DeleteModuleDialog } from './DeleteModuleDialog';
import { RenameModuleDialog } from './RenameModuleDialog';

export interface ModuleActionsProps {
  module: KnowledgeModule;
  /** Runs after a confirmed rename, with the module's slug afterwards. */
  onRenamed: (newSlug: string) => void;
  /** Runs after a confirmed delete — the module no longer exists to navigate into. */
  onDeleted: () => void;
}

export function ModuleActions({ module, onRenamed, onDeleted }: ModuleActionsProps) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="sb-moduleactions">
      {/* Secondary: this header is not the screen's one teal focal point —
          that belongs to saving a page, same reasoning `ModuleDetail.tsx`
          already applies to "take in a source" on the sources tab. */}
      <Button variant="secondary" size="sm" icon="pencil" onClick={() => setRenaming(true)}>
        {t('modules.rename.action')}
      </Button>
      <Button variant="danger" size="sm" icon="trash-2" onClick={() => setDeleting(true)}>
        {t('modules.delete.action')}
      </Button>

      {/* Keyed so opening always starts from the module's current title and a
          clean debounce timer, and closing drops any in-progress plan/mutation
          state rather than carrying it into the next open. */}
      <RenameModuleDialog
        key={renaming ? module.slug : 'closed'}
        open={renaming}
        module={module}
        onClose={() => setRenaming(false)}
        onRenamed={(newSlug) => {
          setRenaming(false);
          onRenamed(newSlug);
        }}
      />

      {/* Same keying reason as rename above: a fresh mount per open is what
          lets the dialog fetch its plan exactly once, on open. */}
      <DeleteModuleDialog
        key={deleting ? module.slug : 'closed'}
        open={deleting}
        module={module}
        onClose={() => setDeleting(false)}
        onDeleted={() => {
          setDeleting(false);
          onDeleted();
        }}
      />
    </div>
  );
}
