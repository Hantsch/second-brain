/* Meldungen. Ein kleiner Speicher außerhalb von React, damit auch die
   Ereignis-Verdrahtung Meldungen einwerfen kann, ohne einen Hook zu brauchen.

   Eine Meldung darf einen Weg zurück tragen (`action`). Das ist keine Zierde:
   ARCHITECTURE.md verlangt zu jeder Aktion ein Rückgängig, und für Aktionen, die
   nur die Oberfläche betreffen (eine Kachel ausblenden), ist die Meldung der
   einzige Ort, an dem es stehen kann. */

import { useSyncExternalStore } from 'react';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export type ToastVars = Record<string, string | number>;

export interface ToastAction {
  /** i18n-Key der Beschriftung. */
  label: string;
  run: () => void;
}

/** Eine Meldung mit allem, was sie tragen kann. */
export interface ToastSpec {
  /** i18n-Key oder fertiger Text — `t()` lässt Unbekanntes unverändert durch. */
  message: string;
  values?: ToastVars;
  /** Zweite Zeile: wo die Sache jetzt steht, nicht die halbe Anleitung. */
  description?: string;
  action?: ToastAction;
}

export interface ToastItem extends ToastSpec {
  id: string;
  kind: ToastKind;
}

const AUTO_DISMISS_MS = 6000;

let items: readonly ToastItem[] = [];
let counter = 0;
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

export function pushToast(kind: ToastKind, message: string | ToastSpec): string {
  counter += 1;
  const id = `toast-${counter}`;
  const spec: ToastSpec = typeof message === 'string' ? { message } : message;
  items = [...items, { ...spec, id, kind }];
  emit();
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
  }
  return id;
}

/** Alle Meldungen wegnehmen. Für Tests und für den Wechsel des Vaults. */
export function clearToasts(): void {
  if (items.length === 0) return;
  items = [];
  emit();
}

export function dismissToast(id: string): void {
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next;
  emit();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

function snapshot(): readonly ToastItem[] {
  return items;
}

export function useToasts(): readonly ToastItem[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
