import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/* Main und Preload werden bewusst als CJS gebaut (`index.cjs`), obwohl das
   Projekt `"type": "module"` ist: Electron laedt den Main-Entry synchron, und
   `sandbox: true` im Renderer verlangt ein CJS-Preload. */
const cjsOutput = {
  format: 'cjs' as const,
  entryFileNames: '[name].cjs',
  chunkFileNames: '[name]-[hash].cjs',
};

const alias = {
  '@core': resolve('src/core'),
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer'),
};

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve('src/main/index.ts') },
      rollupOptions: { output: cjsOutput },
    },
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve('src/preload/index.ts') },
      rollupOptions: { output: cjsOutput },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    build: {
      /* Zwei Einstiegspunkte: das Hauptfenster und das rahmenlose
         Schnell-Erfassen-Fenster. */
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          'quick-capture': resolve('src/renderer/quick-capture.html'),
        },
      },
    },
  },
});
