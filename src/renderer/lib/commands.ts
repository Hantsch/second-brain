/* Registrable commands for the palette. Screens and the base actions are
   fixed; each screen can add its own commands and unregister them again on
   exit. */

import { useSyncExternalStore } from 'react';

export type CommandGroup = 'screens' | 'actions' | 'search';

export interface CommandDef {
  id: string;
  group: CommandGroup;
  /** i18n key or finished text. */
  labelKey: string;
  /** Second line in mono — the file path for search hits. Finished text. */
  hint?: string;
  /** Kebab-case name for the icon atom. */
  icon?: string;
  run: () => void | Promise<void>;
}

let commands: readonly CommandDef[] = [];
const subscribers = new Set<() => void>();

function emit(): void {
  for (const notify of subscribers) notify();
}

/** Puts a command into the palette. The return value unregisters it again. */
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
