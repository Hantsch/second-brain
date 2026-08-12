/* Gaston Toast atom — thin wrapper over the gs-* classes from docs/design-system/gaston/project/components/feedback/Toast.jsx. */
import type { HTMLAttributes } from 'react';
import { Icon } from './Icon';

const TOAST_ICONS: Record<string, string> = {
  info: 'info',
  success: 'circle-check-big',
  warning: 'triangle-alert',
  danger: 'circle-alert',
};

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function Toast({
  variant = 'info',
  title,
  description,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
  className = '',
  ...rest
}: ToastProps) {
  return (
    <div className={`gs-toast gs-toast--${variant} ${className}`} role="status" {...rest}>
      <span className="gs-toast-icon">
        <Icon name={TOAST_ICONS[variant] || 'info'} size={16} />
      </span>
      <div className="gs-toast-body">
        <span className="gs-toast-title">{title}</span>
        {description ? <span className="gs-toast-desc">{description}</span> : null}
        {action ? (
          <button type="button" className="gs-toast-action" onClick={action.onClick}>
            {action.label}
          </button>
        ) : null}
      </div>
      {onDismiss ? (
        <button type="button" className="gs-toast-x" aria-label={dismissLabel} onClick={onDismiss}>
          <Icon name="x" size={14} />
        </button>
      ) : null}
    </div>
  );
}
