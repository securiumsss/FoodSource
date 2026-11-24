import { X } from 'lucide-react';
import type { ActiveFilterChip } from './FilterPanel';

interface Props {
  chips: ActiveFilterChip[];
  onRemove: (chip: ActiveFilterChip) => void;
}

export function InlineFilterChips({ chips, onRemove }: Props) {
  return (
    <ul role="list" aria-label="Применённые фильтры" className="flex min-w-0 max-w-[48%] items-center gap-1.5 overflow-x-auto overscroll-x-contain py-0.5 [scrollbar-width:none] sm:max-w-[60%]">
      {chips.map(chip => (
        <li key={chip.key} className="min-w-0 max-w-full shrink-0">
          <button
            type="button"
            aria-label={'Удалить фильтр: ' + chip.label}
            title={'Удалить фильтр: ' + chip.label}
            onClick={() => onRemove(chip)}
            className="flex h-6 min-w-0 max-w-full items-center gap-1 rounded border border-brand-line bg-brand-soft px-1.5 text-[11px]! font-medium! leading-none! text-brand-ink-strong hover:border-brand-hover hover:bg-brand-line focus-visible:outline-offset-[-2px] sm:gap-1.5 sm:px-2 [@media(pointer:coarse)]:h-8"
          >
            <span className={`min-w-0 truncate ${chip.shortLabel ? 'hidden sm:inline' : ''}`}>{chip.label}</span>
            {chip.shortLabel && <span className="min-w-0 truncate sm:hidden">{chip.shortLabel}</span>}
            <X size={12} className="shrink-0" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
