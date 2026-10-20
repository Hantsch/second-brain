/* Opening a vault path from wherever the app currently stands: close
   whatever overlay is lying on top (the same mechanism the shell itself uses
   to tidy up on navigation, `ShellOverlaysProvider`'s route-change effect —
   this just does it up front instead of waiting a render), then navigate to
   its home (`doc-home.ts`). One place for this so the reader, search results
   and the citation panel don't each grow their own copy. */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeOf } from './doc-home';
import { useShellOverlays } from './shell-overlays';

export function useOpenDoc(): (path: string) => void {
  const navigate = useNavigate();
  /* Outside the shell (isolated screen tests) this is the no-op `CLOSED`
     default — closing nothing is correct there, not an error. */
  const { close } = useShellOverlays();

  return useCallback(
    (path: string) => {
      close();
      navigate(homeOf(path));
    },
    [close, navigate],
  );
}
