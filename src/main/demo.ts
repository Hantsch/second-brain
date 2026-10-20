/* Demo-mode verdict, shared by the app info channel and the update service. */

/**
 * Demo mode: either the launcher set `SB_DEMO` (test scripts), or the open
 * vault is the seeded example folder. The UI is allowed to flag this so
 * nobody mistakes example content for real content.
 */
export function isDemoVault(root: string | null): boolean {
  if (process.env['SB_DEMO'] === '1') return true;
  return root !== null && /[\\/]\.demo-vault$/.test(root);
}
