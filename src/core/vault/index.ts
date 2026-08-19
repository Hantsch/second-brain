/**
 * Oeffentliche Oberflaeche des Vault-Kerns. Andere Kernmodule importieren von hier,
 * nicht aus den Einzeldateien — so bleibt der Umbau innen moeglich.
 */

export * from './types';
export * from './paths';
export * from './frontmatter';
export { canonicalOrder } from './frontmatter-order';
export { patchFrontmatterYaml } from './frontmatter-patch';
export * from './sections';
export * from './doc';
export * from './layout';
export * from './trash';
export * from './watch';
export { sha256, byteLength } from './hash';
export { assertWritable, composeContent } from './compose';
export { FsVaultStore } from './fs-store';
export { MemoryVaultStore } from './memory-store';
