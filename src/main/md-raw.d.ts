/* Vite's `?raw` suffix inlines a file as a string at build time. */
declare module '*.md?raw' {
  const text: string;
  export default text;
}
