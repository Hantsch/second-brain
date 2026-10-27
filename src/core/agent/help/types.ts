/** One concept page of the help module. The file lives at
 *  `modules/gaston-help/wiki/concepts/<slug>.md`. */
export interface HelpPageDef {
  slug: string;
  title: string;
  /** The one line the catalogue shows behind the link. */
  summary: string;
  /** German search words. The pages are English, many questions are not: without them
   *  „Welche Befehle kennt der Agent?“ has nothing to meet on the page. */
  tags: readonly string[];
  body: string;
}
