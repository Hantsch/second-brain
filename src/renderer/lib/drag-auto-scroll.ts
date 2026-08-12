/* Edge scrolling for native HTML drag-and-drop.

   Chromium does not reliably scroll nested overflow containers while an item
   is dragged. Keeping the last pointer position and scrolling on animation
   frames also matters: once the list moves out from under the pointer, no row
   receives another `dragover`, but the container must keep moving. */

const EDGE_SIZE = 80;
const MAX_SPEED = 20;

function scrollableAncestor(source: HTMLElement): HTMLElement | null {
  const view = source.ownerDocument.defaultView;
  let current = source.parentElement;
  let fallback: HTMLElement | null = null;

  while (current !== null) {
    const overflowY = view?.getComputedStyle(current).overflowY ?? '';
    if (overflowY === 'auto' || overflowY === 'scroll') {
      fallback ??= current;
      if (current.scrollHeight > current.clientHeight) return current;
    }
    current = current.parentElement;
  }

  return fallback;
}

/** Pixels to move during one animation frame for the current pointer position. */
export function dragScrollSpeed(
  bounds: Pick<DOMRect, 'top' | 'bottom' | 'height'>,
  y: number,
): number {
  if (bounds.height <= 0) return 0;
  const edge = Math.min(EDGE_SIZE, bounds.height / 4);

  if (y < bounds.top + edge) {
    const strength = Math.min(1, Math.max(0, (bounds.top + edge - y) / edge));
    return -Math.ceil(MAX_SPEED * strength);
  }
  if (y > bounds.bottom - edge) {
    const strength = Math.min(1, Math.max(0, (y - (bounds.bottom - edge)) / edge));
    return Math.ceil(MAX_SPEED * strength);
  }
  return 0;
}

export class DragAutoScroller {
  private container: HTMLElement | null = null;
  private pointerY: number | null = null;
  private frame: number | null = null;
  private view: Window | null = null;

  private readonly trackPointer = (event: globalThis.DragEvent): void => {
    this.pointerY = event.clientY;
  };

  private readonly tick = (): void => {
    if (this.container === null || this.view === null) return;
    if (this.pointerY !== null) {
      this.container.scrollTop += dragScrollSpeed(
        this.container.getBoundingClientRect(),
        this.pointerY,
      );
    }
    this.frame = this.view.requestAnimationFrame(this.tick);
  };

  start(source: HTMLElement): void {
    this.stop();
    this.container = scrollableAncestor(source);
    this.view = source.ownerDocument.defaultView;
    if (this.container === null || this.view === null) return;
    this.view.addEventListener('dragover', this.trackPointer);
    this.frame = this.view.requestAnimationFrame(this.tick);
  }

  update(pointerY: number): void {
    this.pointerY = pointerY;
  }

  stop(): void {
    if (this.view !== null) {
      this.view.removeEventListener('dragover', this.trackPointer);
      if (this.frame !== null) this.view.cancelAnimationFrame(this.frame);
    }
    this.container = null;
    this.pointerY = null;
    this.frame = null;
    this.view = null;
  }
}
