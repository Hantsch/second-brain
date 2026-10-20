/* Type declaration for changelog.mjs — the scripts folder is not in
   tsconfig.node.json's include. The signatures must match the implementation
   exactly; no any. */

export declare const UNRELEASED_PLACEHOLDER: string;

export interface ChangelogCategory {
  name: string;
  bullets: string[];
}

export interface ChangelogSection {
  heading: string;
  categories: ChangelogCategory[];
  raw: string;
}

export declare function parseChangelog(text: string): {
  preamble: string;
  sections: ChangelogSection[];
};

export declare function readUnreleased(text: string): {
  categories: string[];
  bullets: string[];
};

export declare function validateUnreleased(text: string): string | null;

export declare function promote(text: string, version: string, date: string): string;

export declare function notesFor(text: string, version: string): string;
