import * as Popover from '@radix-ui/react-popover';
import type { SupplierWithEvaluation } from '@food-suppliers/shared';
import { ArrowRight, ChevronUp, GitCompareArrows, X } from 'lucide-react';

export function CompareBar({ selected, onRemove, onClear, onCompare }: { selected: SupplierWithEvaluation[]; onRemove: (id: string) => void; onClear: () => void; onCompare: () => void }) {
  if (!selected.length) return null;
  return (
    <div className="relative z-30 shrink-0 border-t border-graphite bg-graphite shadow-[0_-10px_30px_rgba(30,31,33,.08)] backdrop-blur [--focus-outline:var(--color-brand)]">
      <div className="mx-auto flex max-w-[1500px] items-center gap-2 px-4 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:flex-wrap md:gap-3 md:px-7 md:py-3 lg:px-10">
        <div className="mr-auto min-w-0 md:hidden">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="inline-flex h-9 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md px-1 text-[11px] font-semibold text-white">
                <GitCompareArrows size={15} className="shrink-0 text-brand" aria-hidden="true" />
                Выбрано <span className="num">{selected.length} из 4</span>
                <ChevronUp size={13} className="shrink-0 text-graphite-muted" aria-hidden="true" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="top" align="start" sideOffset={12} collisionPadding={12} aria-label="Выбранные поставщики" className="z-40 max-h-(--radix-popover-content-available-height) w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-xl md:hidden">
                <div className="flex items-center justify-between gap-2 border-b border-separator px-2 pb-1">
                  <span className="text-xs font-semibold text-ink">Выбранные поставщики</span>
                  <Popover.Close asChild><button type="button" onClick={onClear} className="min-h-9 px-1 text-xs font-medium text-secondary hover:text-ink">Очистить</button></Popover.Close>
                </div>
                <ul className="space-y-0.5 py-1">
                  {selected.map(s => <li key={s.id} className="flex min-h-10 items-center justify-between gap-2 pl-2 text-xs text-ink">
                    <span className="min-w-0 truncate" title={s.name}>{s.name}</span>
                    <button type="button" onClick={() => onRemove(s.id)} aria-label={`Удалить из выбранных: ${s.name}`} className="grid size-10 shrink-0 place-items-center rounded-md text-secondary hover:bg-soft hover:text-ink"><X size={15} aria-hidden="true" /></button>
                  </li>)}
                </ul>
                {selected.length < 2 && <p className="px-2 pb-1 text-[11px] text-secondary">Выберите ещё поставщика</p>}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="hidden items-center gap-2 text-xs font-bold text-white md:flex"><span className="grid h-8 w-8 place-items-center rounded-lg bg-graphite-hover text-brand"><GitCompareArrows size={16} /></span><span>Сравнение <span className="text-graphite-muted">{selected.length}/4</span></span></div>
        <div className="hidden min-w-0 flex-1 flex-wrap gap-1.5 md:flex">
          {selected.map(s => <span key={s.id} className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md bg-graphite-hover px-2 py-1.5 text-[11px] font-medium text-soft"><span className="truncate">{s.name}</span><button type="button" onClick={() => onRemove(s.id)} aria-label={`Убрать ${s.name} из сравнения`} className="text-graphite-muted hover:text-white"><X size={13} /></button></span>)}
        </div>
        <button type="button" onClick={onClear} className="hidden text-xs font-semibold text-soft hover:text-white md:block">Очистить</button>
        <button type="button" onClick={onCompare} disabled={selected.length < 2} className="btn-primary shrink-0 whitespace-nowrap shadow-[inset_0_0_0_1px_var(--color-muted)] max-md:min-h-9 max-md:px-2.5">Сравнить ({selected.length}) <ArrowRight size={14} /></button>
        {selected.length < 2 && <span className="hidden text-[10px] text-graphite-muted md:inline">Выберите ещё поставщика</span>}
      </div>
    </div>
  );
}
