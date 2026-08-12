/* Pfade, Slugs und der Bauer einer Wiki-Seite des Demo-Bestands.
   Getrennt von den Inhalten (`demo-pages.ts`) und von der Zusammenstellung
   (`demo-vault.ts`), damit jede Datei eine Sache tut. */

import { serialize } from '@core/vault/frontmatter';
import { day } from '../../helpers/time';

export const MODULE = 'identity-management';
export const HEALTHY = 'second-brain-methodik';
export const OAUTH_SOURCE = `s-${day(-215)}-oauth-grundlagen`;
export const BLOG_SOURCE = `s-${day(-6)}-token-lifetimes-blog`;
export const VIDEO_SOURCE = `s-${day(-9)}-video-wissensverfall`;

/** Pfade, auf die die Tests sich beziehen. */
export const DEMO = {
  module: MODULE,
  healthyModule: HEALTHY,
  catalog: `modules/${MODULE}/wiki/index.md`,
  log: `modules/${MODULE}/wiki/log.md`,
  oauth: `modules/${MODULE}/wiki/entities/oauth2.md`,
  scim: `modules/${MODULE}/wiki/entities/scim.md`,
  token: `modules/${MODULE}/wiki/concepts/token-lebensdauer.md`,
  oldToken: `modules/${MODULE}/wiki/concepts/altes-token-konzept.md`,
  tenants: `modules/${MODULE}/wiki/concepts/mandantentrennung.md`,
  jit: `modules/${MODULE}/wiki/concepts/just-in-time-provisionierung.md`,
  overview: `modules/${MODULE}/wiki/overview.md`,
  oauthSource: `modules/${MODULE}/wiki/sources/${OAUTH_SOURCE}.md`,
  blogSource: `modules/${MODULE}/wiki/sources/${BLOG_SOURCE}.md`,
  videoSource: `modules/${HEALTHY}/wiki/sources/${VIDEO_SOURCE}.md`,
  decay: `modules/${HEALTHY}/wiki/concepts/wissensverfall.md`,
  healthyCatalog: `modules/${HEALTHY}/wiki/index.md`,
  oldDump: `inbox/${day(-19)}-1855-einkauf-hochbeet.md`,
  freshDump: `inbox/${day(0)}-1132-idee-wochenrueckblick.md`,
  keptDump: `inbox/${day(-21)}-2310-zu-viele-baustellen.md`,
  rawWeb: 'raw/web/2026-08-06-digital-gardening-ueberblick',
  rawFiles: `raw/files/${day(-24)}-rollenkonzept-workshop`,
  projectWithStep: 'projects/work/sso-migration/project.md',
  projectWithoutStep: 'projects/private/hochbeet-bauen/project.md',
  pausedProject: 'projects/work/altes-portal/project.md',
} as const;

/** Slugs der Quellseiten — Tests brauchen sie für Wikilinks. */
export const DEMO_SLUGS = { oauth: OAUTH_SOURCE, blog: BLOG_SOURCE, video: VIDEO_SOURCE } as const;

export interface PageInput {
  type: 'source' | 'entity' | 'concept' | 'overview';
  slug: string;
  title: string;
  module: string;
  created: number;
  reviewed: number;
  tags?: string[];
  sources?: string[];
  extra?: Record<string, unknown>;
  body: string;
}

export function page(input: PageInput): string {
  return serialize(
    {
      type: input.type,
      title: input.title,
      module: input.module,
      created: day(input.created),
      updated: day(input.reviewed),
      reviewed: day(input.reviewed),
      tags: input.tags ?? [],
      sources: input.sources ?? [],
      lang: 'de',
      ...(input.extra ?? {}),
    },
    input.body,
  );
}
