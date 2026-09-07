import type { FilingProposal } from './capture';

/**
 * The frontmatter fields of a journal day, as the day close-out suggests
 * them and as the user confirms them. `null` for mood and energy means "not
 * found" resp. "do not write" — never "set to null".
 */
export interface JournalFrontmatterFields {
  people: string[];
  /** Project slugs. */
  projects: string[];
  areas: string[];
  mood: number | null;
  energy: number | null;
  tags: string[];
}

/**
 * The day close-out's suggestion. Nothing from it is written yet: the card
 * shows it, `journal:applyClose` carries out what was confirmed.
 */
export interface JournalCloseSuggestion {
  date: string;
  path: string;
  /** Same shape as in the inbox — the same card, the same buttons. */
  proposal: FilingProposal;
  frontmatter: JournalFrontmatterFields;
  /** Produced entirely without a model. */
  heuristic: boolean;
}
