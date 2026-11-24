import { useId, useMemo, useRef, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import type { SuppliersListResponse, SuppliersQueryParams } from '@food-suppliers/shared';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { FilterPanel, getActiveFilterChips } from './FilterPanel';
import { InlineFilterChips } from './InlineFilterChips';

interface Props {
  filters: SuppliersQueryParams;
  facets: SuppliersListResponse['facets'] | null;
  search: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onChange: (patch: Partial<SuppliersQueryParams>) => void;
  onReset: () => void;
}

export function CatalogToolbar({ filters, facets, search, onSearchChange, onClearSearch, onChange, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const popoverTitle = useId();
  const chips = useMemo(() => getActiveFilterChips(filters), [filters]);
  const hasCustomSort = Boolean(filters.sortBy && filters.sortBy !== 'score');
  const hasToolbarSettings = Boolean(chips.length || hasCustomSort);
  const hasChanges = Boolean(hasToolbarSettings || search.trim() || filters.category || filters.status);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <div className="mb-4">
        <div className="flex h-11 min-w-0 items-stretch overflow-hidden rounded-lg border border-line bg-white [@media(pointer:fine)]:h-8">
          <Popover.Trigger asChild>
            <button
              ref={filterButton}
              type="button"
              aria-label="Фильтры"
              className={`flex shrink-0 items-center gap-1.5 border-r border-line px-2.5 text-[12px]! font-semibold! transition-colors focus-visible:outline-offset-[-3px] sm:px-3 ${open ? 'bg-brand-soft text-brand-ink-strong' : 'bg-soft text-ink hover:bg-separator'}`}
            >
              <SlidersHorizontal size={15} aria-hidden="true" /> Фильтры
              {chips.length > 0 && <span className="num rounded bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand-ink-strong" aria-label={`Активных фильтров: ${chips.length}`}>{chips.length}</span>}
              {chips.length === 0 && hasCustomSort && <span className="h-1.5 w-1.5 rounded-full bg-brand" title="Изменена сортировка" aria-label="Изменена сортировка" />}
            </button>
          </Popover.Trigger>
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5 sm:px-3">
            <Search size={16} aria-hidden="true" className="shrink-0 text-muted" />
            <label htmlFor="supplier-search" className="sr-only">Поиск</label>
            <input
              ref={searchInput}
              id="supplier-search"
              value={search}
              onChange={event => onSearchChange(event.target.value)}
              placeholder="Название, ассортимент, город или заметка"
              className="h-full min-w-0 flex-1 bg-transparent text-[13px]! text-ink outline-none! placeholder:text-muted"
            />
            {search !== '' && <button
              type="button"
              aria-label="Очистить поиск"
              title="Очистить поиск"
              className="grid h-7 w-7 shrink-0 place-items-center rounded text-secondary hover:bg-separator hover:text-ink"
              onClick={() => { onClearSearch(); searchInput.current?.focus(); }}
            ><X size={15} aria-hidden="true" /></button>}
          </div>
        </div>
        {chips.length > 0 && (
          <InlineFilterChips
            chips={chips}
            onRemove={chip => { onChange(chip.clear); filterButton.current?.focus(); }}
          />
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={7}
          collisionPadding={12}
          aria-labelledby={popoverTitle}
          className="z-40 max-h-[min(32rem,var(--radix-popover-content-available-height))] w-[min(45rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-xl border border-line bg-white shadow-[0_12px_34px_rgba(30,31,33,0.14)] outline-none"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-2">
            <h2 id={popoverTitle} className="text-sm font-semibold text-ink">Фильтры поставщиков</h2>
            <Popover.Close className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-secondary hover:bg-separator hover:text-ink" aria-label="Закрыть фильтры">
              <X size={16} aria-hidden="true" />
            </Popover.Close>
          </div>
          <FilterPanel filters={filters} facets={facets} onChange={onChange} onReset={onReset} active={hasChanges} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
