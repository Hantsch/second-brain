import type { VaultStore } from '../vault/types';

export interface SetupTemplate {
  id: string;
  /** Vault-relative path the template is installed to. */
  path: string;
  version: number;
  format: 'markdown' | 'markdown-frontmatter' | 'script' | 'json';
  body: string;
}

/** What the setup reads and writes in a vault — a subset of `VaultStore` that the main-side store also satisfies. */
export type SetupStore = Pick<
  VaultStore,
  'readText' | 'writeText' | 'exists' | 'snapshot' | 'mkdir'
> & {
  walk(options?: { dir?: string }): AsyncIterable<{ path: string }>;
};
