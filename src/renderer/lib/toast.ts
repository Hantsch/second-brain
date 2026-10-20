/* Toasts. A small store outside of React, so that event wiring can also
   throw in toasts without needing a hook.

   A toast may carry a way back (`action`). That's not decoration:
   ARCHITECTURE.md requires an undo for every action, and for actions that
   only affect the surface (hiding a tile), the toast is the only place it
   can live. */

import { useSyncExternalStore } from 'react';

export type ToastKind = 'info' | 'success' | 'warn' | 'error';

export type ToastVars = Record<string, string | number>;

export interface ToastAction {
  /** i18n key of the label. */
  label: string;
  run: () => void;
}

/** A toast with everything it can carry. */
export interface ToastSpec {
  /** i18n key or finished text — `t()` passes unknown keys through unchanged. */
  message: string;
  values?: ToastVars;
  /** Second line: where things stand now, not half a set of instructions. */
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

/** Remove all toasts. For tests and for switching vaults. */
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
