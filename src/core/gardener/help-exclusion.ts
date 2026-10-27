import { HELP_MODULE_SLUG } from '@shared/help-module';
import type { GardenerIndexView } from './types';

const HELP_PREFIX = `modules/${HELP_MODULE_SLUG}/`;
const HELP_MODULE_FILE = `${HELP_PREFIX}module.md`;

const inHelpModule = (path: string): boolean => path.startsWith(HELP_PREFIX);

/**
 * The view the gardener checks and the health score read: Gaston maintains its help
 * module, so a finding there would be one the user can neither act on nor keep fixed.
 *
 * Only a module.md carrying `managed_by: gaston` is Gaston's. A folder that merely has
 * the same name is the user's content and stays checked — the view is returned as is.
 * Every collection keyed by path or module is cut together; leaving one behind would
 * let the size or a check still see the module.
 */
export function withoutHelpModule(view: GardenerIndexView): GardenerIndexView {
  const data = view.index();
  if (data.byPath.get(HELP_MODULE_FILE)?.frontmatter.managed_by !== 'gaston') return view;

  const byPath = new Map([...data.byPath].filter(([path]) => !inHelpModule(path)));
  const filtered = {
    docs: data.docs.filter((doc) => !inHelpModule(doc.path)),
    byPath,
    brokenLinks: data.brokenLinks.filter((link) => !inHelpModule(link.path)),
    todos: data.todos.filter((todo) => !inHelpModule(todo.path)),
  };
  const todos = view.todos().filter((todo) => !inHelpModule(todo.path));
  return {
    index: () => filtered,
    pages: () => view.pages().filter((page) => page.module !== HELP_MODULE_SLUG),
    projects: () => view.projects(),
    sources: () => view.sources(),
    dumps: () => view.dumps(),
    journal: () => view.journal(),
    todos: () => todos,
    areas: () => view.areas(),
  };
}
