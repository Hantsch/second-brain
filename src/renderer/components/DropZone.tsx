/* Eine Fläche, auf die man Dateien, Links und Text fallen lassen kann.

   Was hier passiert und warum es so aussieht: der Renderer bekommt vom
   Betriebssystem nur den *Inhalt* einer fallengelassenen Datei, nicht ihren Pfad
   (Electron hat `File.path` entfernt, und diese App gibt dem Renderer keinen
   Zugang zum Dateisystem). Deshalb:

   - Text und Links landen sofort im Eingang.
   - Textdateien werden gelesen und als Text aufgenommen.
   - Alles andere (PDF, Bilder, Archive) sagt ehrlich, dass es den Dateidialog
     braucht — nur dort kennt die App den Pfad und kann das Original unverändert
     nach `raw/` legen.

   Der Rahmen ist keine Attrappe: er umschließt seinen Inhalt und lässt jeden
   Klick durch, solange nichts gezogen wird. */

import { useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';

/** Dateiendungen, deren Inhalt als Text durchgeht. */
const TEXT_EXTENSIONS = [
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.csv',
  '.json',
  '.log',
  '.yml',
  '.yaml',
];

/** Eine gelesene Datei: Name und Inhalt. */
export interface DroppedFile {
  name: string;
  text: string;
}

export interface DropZoneProps {
  /** Fallengelassener Text oder Link. */
  onText: (text: string) => void;
  /** Gelesene Textdateien. */
  onFiles: (files: DroppedFile[]) => void;
  /**
   * Dateien, die nicht als Text durchgehen (`kind: 'unsupported'`) oder sich
   * nicht lesen ließen (`kind: 'unreadable'`) — mit ihren Namen.
   */
  onRejected: (kind: 'unsupported' | 'unreadable', names: string[]) => void;
  children: ReactNode;
}

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/') || file.type === 'application/json') return true;
  const name = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function DropZone({ onText, onFiles, onRejected, children }: DropZoneProps) {
  const t = useT();
  const [over, setOver] = useState(false);
  /* Ein Zähler, kein Umschalter: `dragleave` feuert auch beim Wechsel zwischen
     Kindelementen — ein Umschalter würde dabei flackern. */
  const depth = useRef(0);

  const accept = (event: DragEvent<HTMLDivElement>): boolean =>
    [...event.dataTransfer.types].some(
      (type) => type === 'Files' || type === 'text/plain' || type === 'text/uri-list',
    );

  const read = async (files: readonly File[]): Promise<void> => {
    const usable = files.filter(isTextFile);
    const rejected = files.filter((file) => !isTextFile(file));
    if (rejected.length > 0) {
      onRejected(
        'unsupported',
        rejected.map((file) => file.name),
      );
    }
    const taken: DroppedFile[] = [];
    const broken: string[] = [];
    for (const file of usable) {
      try {
        taken.push({ name: file.name, text: await file.text() });
      } catch {
        broken.push(file.name);
      }
    }
    if (broken.length > 0) onRejected('unreadable', broken);
    if (taken.length > 0) onFiles(taken);
  };

  const drop = (event: DragEvent<HTMLDivElement>): void => {
    if (!accept(event)) return;
    event.preventDefault();
    depth.current = 0;
    setOver(false);
    const files = [...event.dataTransfer.files];
    if (files.length > 0) {
      void read(files);
      return;
    }
    const text = event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text');
    if (text.trim().length > 0) onText(text.trim());
  };

  return (
    <div
      className={`sb-dropzone${over ? ' sb-dropzone--over' : ''}`}
      onDragEnter={(event) => {
        if (!accept(event)) return;
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(event) => {
        if (!accept(event)) return;
        /* Ohne das öffnet Electron die Datei selbst und der Screen verschwindet. */
        event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!accept(event)) return;
        depth.current -= 1;
        if (depth.current <= 0) setOver(false);
      }}
      onDrop={drop}
    >
      {children}
      {over ? (
        <div className="sb-dropzone-veil" aria-hidden="true">
          <span className="sb-dropzone-badge">
            <Icon name="upload" size={16} />
            {t('sources.drop.title')}
          </span>
          <span className="sb-dropzone-note">{t('sources.drop.body')}</span>
        </div>
      ) : null}
    </div>
  );
}
