/* Gaston Tooltip atom — thin wrapper over the gs-* classes from docs/design-system/gaston/project/components/feedback/Tooltip.jsx. */
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

export interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  children: ReactNode;
}

export function Tooltip({ content, side = 'top', delay = 150, children }: TooltipProps) {
  const [open, setOpen] = useState<boolean>(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <span
      className="gs-tooltipwrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span className={`gs-tooltip gs-tooltip--${side}`} role="tooltip">
          {content}
        </span>
      )}
    </span>
  );
}
