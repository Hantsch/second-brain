#!/usr/bin/env node
/* VSCode setzt in integrierten Terminals ELECTRON_RUN_AS_NODE=1. Erbt Electron
   die Variable, startet es als reiner Node-Prozess und stirbt mit
   "Cannot read properties of undefined (reading 'getVersion')".
   Dieser Launcher entfernt sie, bevor electron-vite startet. */
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const mode = process.argv[2] === 'preview' ? 'preview' : 'dev';
const bin = process.platform === 'win32' ? 'electron-vite.cmd' : 'electron-vite';

const child = spawn(bin, [mode, ...process.argv.slice(3)], {
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
