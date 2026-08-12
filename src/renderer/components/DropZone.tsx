/* A surface you can drop files, links, and text onto.

   What happens here and why it looks this way: the operating system only
   gives the renderer the *content* of a dropped file, not its path (Electron
   removed `File.path`, and this app doesn't give the renderer access to the
   filesystem). Hence:

   - Text and links land straight in the inbox.
   - Text files are read and ingested as text.
   - Everything else (PDF, images, archives) honestly says it needs the file
     dialog — only there does the app know the path and can copy the original
     unchanged into `raw/`.

   The frame isn't a dummy wrapper: it wraps its content and lets every click
   through as long as nothing is being dragged. */

import { useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Icon } from '../atoms/Icon';
import { useT } from '../i18n';

/** File extensions whose content passes as text. */
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

/** A file that was read: name and content. */
export interface DroppedFile {
  name: string;
  text: string;
}

export interface DropZoneProps {
  /** Dropped text or link. */
  onText: (text: string) => void;
  /** Text files that were read. */
  onFiles: (files: DroppedFile[]) => void;
  /**
   * Files that don't pass as text (`kind: 'unsupported'`) or couldn't be
   * read (`kind: 'unreadable'`) — with their names.
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
  /* A counter, not a toggle: `dragleave` also fires when moving between child
     elements — a toggle would flicker in that case. */
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
        /* Without this, Electron opens the file itself and the screen disappears. */
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
