/* Meldungen unten rechts. Die Nachricht ist ein i18n-Key, wenn es einen gibt —
   sonst der Text, wie er aus dem Hauptprozess kam. */

import { Toast } from '../atoms/Toast';
import { useT } from '../i18n';
import { dismissToast, useToasts } from '../lib/toast';
import type { ToastKind } from '../lib/toast';

const VARIANTS: Record<ToastKind, 'info' | 'success' | 'warning' | 'danger'> = {
  info: 'info',
  success: 'success',
  warn: 'warning',
  error: 'danger',
};

export function ToastHost() {
  const t = useT();
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div className="sb-toasts" role="region" aria-label={t('toast.region')}>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          variant={VARIANTS[toast.kind]}
          title={t(toast.message, toast.values)}
          {...(toast.description === undefined
            ? {}
            : { description: t(toast.description, toast.values) })}
          {...(toast.action === undefined
            ? {}
            : {
                action: {
                  label: t(toast.action.label),
                  /* Erst tun, dann verschwinden: die Meldung soll nicht
                     stehenbleiben, nachdem sie ihren Zweck erfüllt hat. */
                  onClick: () => {
                    toast.action?.run();
                    dismissToast(toast.id);
                  },
                },
              })}
          dismissLabel={t('toast.dismiss')}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>
  );
}
