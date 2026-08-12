import { Button } from '../atoms/Button';
import { useT } from '../i18n';

export type TodoPriority = 1 | 2 | 3;

export interface PriorityToggleProps {
  value: TodoPriority;
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: TodoPriority) => void;
}

function keyFor(value: TodoPriority): 'low' | 'medium' | 'high' {
  return value === 1 ? 'low' : value === 3 ? 'high' : 'medium';
}

export function PriorityToggle({
  value,
  ariaLabel,
  disabled = false,
  onChange,
}: PriorityToggleProps) {
  const t = useT();

  return (
    <div className="sb-priority-toggle" role="group" aria-label={ariaLabel}>
      {([1, 2, 3] as const).map((priority) => (
        <Button
          key={priority}
          className={`sb-priority-choice sb-priority-choice--${keyFor(priority)}`}
          variant={value === priority ? 'secondary' : 'ghost'}
          size="sm"
          disabled={disabled}
          aria-pressed={value === priority}
          onClick={() => onChange(priority)}
        >
          {t(`todo.priority.${keyFor(priority)}`)}
        </Button>
      ))}
    </div>
  );
}
