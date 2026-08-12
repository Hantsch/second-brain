/* Registrierbare Befehle für die Palette. Screens und die Grundaktionen stehen
   fest; jeder Screen kann eigene Befehle nachlegen und beim Verlassen wieder
   abmelden. */

import { useSyncExternalStore } from 'react';

export type CommandGroup = 'screens' | 'actions' | 'search';

export interface CommandDef {
  id: string;
  group: CommandGroup;
  /** i18n-Key oder fertiger Text. */
  labelKey: string;
  /** Zweite Zeile in Mono — bei Suchtreffern der Dateipfad. Fertiger Text. */
  hint?: string;
  /** Kebab-case-Name für das Icon-Atom. */
  icon?: string;
  run: () => void | Promise<void>;
}

let commands: readonly CommandDef[] = [];
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

/** Legt einen Befehl in die Palette. Rückgabe meldet ihn wieder ab. */
export function registerCommand(command: CommandDef): () => void {
  commands = [...commands.filter((entry) => entry.id !== command.id), command];
  emit();
  return () => {
    commands = commands.filter((entry) => entry.id !== command.id);
    emit();
  };
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

function snapshot(): readonly CommandDef[] {
  return commands;
}

export function useRegisteredCommands(): readonly CommandDef[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
