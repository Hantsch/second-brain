/* Gaston Dialog atom — thin wrapper over the gs-* classes from docs/design-system/gaston/project/components/overlay/Dialog.jsx. */
import type { MouseEvent, ReactNode } from 'react';
import { useEffect } from 'react';
import { Icon } from './Icon';

const DIALOG_WIDTHS: Record<string, number> = { sm: 380, md: 460, lg: 620 };

export interface DialogProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  footer?: ReactNode;
  children?: ReactNode;
  closeLabel?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
  closeLabel = 'Close',
}: DialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="gs-scrim"
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className="gs-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: DIALOG_WIDTHS[size] || DIALOG_WIDTHS.md }}
      >
        <div className="gs-dialog-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="gs-dialog-title">{title}</h2>
            {description ? <p className="gs-dialog-desc">{description}</p> : null}
          </div>
          {onClose ? (
            <button type="button" className="gs-dialog-x" aria-label={closeLabel} onClick={onClose}>
              <Icon name="x" size={16} />
            </button>
          ) : null}
        </div>
        {children ? <div className="gs-dialog-body">{children}</div> : null}
        {footer ? <div className="gs-dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
