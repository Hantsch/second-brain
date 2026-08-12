import type { HTMLAttributes } from 'react';
import { Icon } from './Icon';

/* Gaston Tag atom — thin wrapper over the `gs-tag` classes from
   docs/design-system/gaston/project/components/display/Tag.jsx. */

export interface TagProps extends HTMLAttributes<HTMLSpanElement> {
  /** Kebab-case icon name, see Icon atom */
  icon?: string;
  onRemove?: () => void;
  removeLabel?: string;
}

export function Tag({
  icon,
  onRemove,
  removeLabel = 'Remove',
  className = '',
  children,
  ...rest
}: TagProps) {
  return (
    <span className={`gs-tag ${className}`} {...rest}>
      {icon ? <Icon name={icon} size={11} /> : null}
      {children}
      {onRemove ? (
        <button type="button" className="gs-tag-x" aria-label={removeLabel} onClick={onRemove}>
          <Icon name="x" size={11} />
        </button>
      ) : null}
    </span>
  );
}
