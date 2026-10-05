/* The overlays the shell can open from anywhere: capture and ask.

   Why React state in the shell and not a search param: every screen builds
   its own query string from its own filters and rewrites it on the next
   change — the overlay would close by itself as soon as anyone touched a
   filter. The shell outlives the screen, so the state belongs here.

   The address is still read here, for two things: it decides what an ask
   starts out restricted to (`ask-scope.ts`), and a change of it closes the
   open overlay. Both need the router, which the provider has — it is mounted
   inside `AppShell`, and that sits inside the router. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { Scope } from '@shared/types';
import type { AskRouteScope } from './ask-scope';
import { askScopeFor } from './ask-scope';

/** What an opener may hand to the ask overlay. Everything is optional: an
    opener that only knows the question sets only the question. */
export interface AskPrefill {
  question?: string;
  module?: string | null;
  project?: string | null;
  scope?: Scope | null;
  /** Ask straight away instead of waiting for the user to press enter. */
  submit?: boolean;
  /** Continue an existing conversation instead of starting a new one. */
  threadId?: string;
}

export type ShellOverlay = 'capture' | 'ask';

export interface ShellOverlaysApi {
  open: ShellOverlay | null;
  askPrefill: AskPrefill | null;
  openCapture: () => void;
  openAsk: (prefill?: AskPrefill) => void;
  close: () => void;
}

/* A default value with no-op openers instead of a hook that throws without a
   provider: components that call `useShellOverlays` also run outside the
   shell — in the quick-capture window and in isolated screen tests. There
   they simply have nothing to open, which is not an error. */
const CLOSED: ShellOverlaysApi = {
  open: null,
  askPrefill: null,
  openCapture: () => undefined,
  openAsk: () => undefined,
  close: () => undefined,
};

const ShellOverlaysContext = createContext<ShellOverlaysApi>(CLOSED);

/** The addresses that exist only to open an overlay (`OpenOverlayRoute` in
    `App.tsx`). They open it and hand the URL straight on to the dashboard. */
const OPENER_ROUTES: ReadonlySet<string> = new Set(['/capture', '/ask']);

/**
 * What the opener asked for, over what the address implies.
 *
 * "No explicit prefill" is meant per field, not per call: the palette opens
 * with `{ question, submit }` and `#/ask?q=…` with `{ question }` — neither
 * says anything about scope, and both must still pick up the module or
 * project the user was standing in. A field the opener did supply wins, so an
 * explicit `module: null` really does mean "no filter".
 */
function withRouteScope(derived: AskRouteScope, prefill?: AskPrefill): AskPrefill {
  const merged: AskPrefill = {
    module: prefill?.module === undefined ? derived.module : prefill.module,
    project: prefill?.project === undefined ? derived.project : prefill.project,
  };
  if (prefill?.question !== undefined) merged.question = prefill.question;
  if (prefill?.scope !== undefined) merged.scope = prefill.scope;
  if (prefill?.submit !== undefined) merged.submit = prefill.submit;
  if (prefill?.threadId !== undefined) merged.threadId = prefill.threadId;
  return merged;
}

export function useShellOverlays(): ShellOverlaysApi {
  return useContext(ShellOverlaysContext);
}

export function ShellOverlaysProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<ShellOverlay | null>(null);
  const [askPrefill, setAskPrefill] = useState<AskPrefill | null>(null);
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  /* One overlay at a time — opening one closes the other, and a prefill
     never outlives the overlay it was meant for. */
  const openCapture = useCallback(() => {
    setAskPrefill(null);
    setOpen('capture');
  }, []);

  const openAsk = useCallback(
    (prefill?: AskPrefill) => {
      setAskPrefill(withRouteScope(askScopeFor(pathname, params), prefill));
      setOpen('ask');
    },
    [pathname, params],
  );

  const close = useCallback(() => {
    setOpen(null);
    setAskPrefill(null);
  }, []);

  /* Leaving the screen closes the overlay. Without this it stays lying on top
     of the next screen: the ask overlay's "set up routing" link and the
     capture overlay's "to inbox" both navigate, and the user ended up behind
     the scrim, on a screen they could not see.

     The exception are the opener routes, and both halves of their move have to
     be ignored. Arriving at `/ask` opens the overlay from `OpenOverlayRoute`,
     whose effect runs before this one (child effects flush first), so the
     change would close what was just opened; leaving `/ask` again for the
     dashboard is that route's own redirect and means nothing else. */
  const previous = useRef(pathname);
  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === pathname || OPENER_ROUTES.has(from) || OPENER_ROUTES.has(pathname)) return;
    setOpen(null);
    setAskPrefill(null);
  }, [pathname]);

  const value = useMemo<ShellOverlaysApi>(
    () => ({ open, askPrefill, openCapture, openAsk, close }),
    [open, askPrefill, openCapture, openAsk, close],
  );

  return <ShellOverlaysContext.Provider value={value}>{children}</ShellOverlaysContext.Provider>;
}
