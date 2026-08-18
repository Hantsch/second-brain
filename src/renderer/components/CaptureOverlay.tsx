/* Capture as an overlay over the current screen: the thought arrives without
   the screen underneath having to give way.

   The frame is hand-rolled like the one in `CommandPalette` — scrim plus
   dialog with its own width — because the `Dialog` atom caps at 820 px and
   its head/body/foot structure adds chrome the capture body already brings
   itself. */

import { useT } from '../i18n';
import { CapturePanel } from '../screens/capture/CapturePanel';

export interface CaptureOverlayProps {
  onClose: () => void;
}

export function CaptureOverlay({ onClose }: CaptureOverlayProps) {
  const t = useT();
  return (
    <div
      className="gs-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="gs-dialog sb-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={t('screen.capture.title')}
      >
        {/* Escape needs both paths: the shell's global hotkey closes the
            overlay from anywhere on the page, but the capture field swallows
            the key (`stopPropagation`) — and that is exactly where focus
            lands. So the panel gets the closer handed in as well. */}
        <CapturePanel onEscape={onClose} />
      </div>
    </div>
  );
}
