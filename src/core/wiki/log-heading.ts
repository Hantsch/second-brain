/**
 * The one definition of a log entry heading. The wiki-check hook interpolates this source into its
 * PowerShell, so what the hook counts as an entry is exactly what `parseLog` reads. It lives in a
 * leaf module because the renderer's type project compiles the hook templates and must not pull
 * the whole wiki layer in through them.
 */
export const LOG_HEADING_SOURCE = String.raw`^##\s*\[(\d{4}-\d{2}-\d{2})\]\s*(ingest|query|lint)\s*(?:\|\s*(.*))?$`;
