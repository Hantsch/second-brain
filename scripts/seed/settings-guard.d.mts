/* Typdeklaration für settings-guard.mjs — der scripts-Ordner ist nicht in
   tsconfig.node.json's include, daher hätte der Import aus einem Test
   sonst keine Typinformation. Signatur muss exakt zur Implementierung
   passen; kein any. */

export declare function checkSettingsGuard(settings: unknown, vaultRoot: string): string[];
