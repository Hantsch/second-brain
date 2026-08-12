/* Gaston Tabs atom — thin wrapper over the gs-* classes from docs/design-system/gaston/project/components/navigation/Tabs.jsx. */
import type { HTMLAttributes } from 'react';
import { Icon } from './Icon';

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  count?: number;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  items: TabItem[];
  value: string;
  onChange?: (id: string) => void;
}

export function Tabs({ items, value, onChange, className = '', ...rest }: TabsProps) {
  return (
    <div role="tablist" className={`gs-tabs ${className}`} {...rest}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className="gs-tab"
          onClick={() => onChange?.(item.id)}
        >
          {item.icon ? <Icon name={item.icon} size={14} /> : null}
          {item.label}
          {item.count !== undefined && item.count !== null ? (
            <span className="gs-tab-count">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
