import { X } from 'lucide-react';
import type { ActiveFilterChip } from './FilterPanel';

interface Props {
  chips: ActiveFilterChip[];
  onRemove: (chip: ActiveFilterChip) => void;
}

export function InlineFilterChips({ chips, onRemove }: Props) {
  return (
    <ul aria-label="Применённые фильтры" className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
      {chips.map(chip => (
        <li key={chip.key} className="min-w-0 max-w-full">
          <button
            type="button"
            aria-label={'Удалить фильтр: ' + chip.label}
            title={'Удалить фильтр: ' + chip.label}
            onClick={() => onRemove(chip)}
            className="inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded border border-brand-line bg-brand-soft px-2 text-[11px]! font-medium! leading-none! text-brand-ink-strong hover:border-brand-hover hover:bg-brand-line [@media(pointer:coarse)]:h-8"
          >
            <span className="min-w-0 truncate">{chip.label}</span>
            <X size={12} className="shrink-0" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
