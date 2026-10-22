/** One concept page of the help module. The file lives at
 *  `modules/gaston-help/wiki/concepts/<slug>.md`. */
export interface HelpPageDef {
  slug: string;
  title: string;
  /** The one line the catalogue shows behind the link. */
  summary: string;
  body: string;
}
