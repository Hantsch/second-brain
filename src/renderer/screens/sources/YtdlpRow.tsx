/* Der Zustand von yt-dlp als ruhige Zeile mit Leuchtpunkt.

   Vorbild ist der Ablauf aus ../yougrab: sagen, was da ist, und wenn nichts da
   ist, sagen was passieren würde — bevor jemand klickt. Kein Download geschieht
   von selbst; „Automatisch holen" ist die einzige Stelle, die lädt. */

import { Button } from '../../atoms/Button';
import { Spinner } from '../../atoms/Spinner';
import { useT } from '../../i18n';
import type { YtdlpStatus } from '../../lib/queries/ingest';

export interface YtdlpRowProps {
  status: YtdlpStatus | undefined;
  pending: boolean;
  installing: boolean;
  onInstall: () => void;
}

export function YtdlpRow({ status, pending, installing, onInstall }: YtdlpRowProps) {
  const t = useT();

  if (pending || status === undefined) {
    return (
      <p className="sb-ytdlp">
        <span className="sb-dot" />
        <span className="sb-ytdlp-text">{t('sources.ytdlp.checking')}</span>
      </p>
    );
  }

  if (status.available) {
    return (
      <p className="sb-ytdlp">
        <span className="sb-dot sb-dot--ok" />
        <span className="sb-ytdlp-text">{t('sources.ytdlp.present')}</span>
        <span className="sb-mono">{status.version ?? ''}</span>
      </p>
    );
  }

  return (
    <div className="sb-ytdlp sb-ytdlp--missing">
      <span className="sb-dot" />
      <span className="sb-ytdlp-text">{t('sources.ytdlp.missing')}</span>
      <span className="sb-ytdlp-what">{t('sources.ytdlp.what')}</span>
      {installing ? (
        <span className="sb-ytdlp-busy">
          <Spinner size={14} />
          {t('sources.ytdlp.installing')}
        </span>
      ) : (
        <Button variant="secondary" size="sm" icon="download" onClick={onInstall}>
          {t('sources.ytdlp.install')}
        </Button>
      )}
    </div>
  );
}
