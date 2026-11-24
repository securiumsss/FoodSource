import * as Popover from '@radix-ui/react-popover';
import type { SupplierWithEvaluation } from '@food-suppliers/shared';
import { ArrowRight, ChevronDown, GitCompareArrows, X } from 'lucide-react';

export function CompareBar({ selected, onRemove, onClear, onCompare }: { selected: SupplierWithEvaluation[]; onRemove: (id: string) => void; onClear: () => void; onCompare: () => void }) {
  const count = selected.length;
  if (!count) return null;
  return (
    <div role="region" aria-label="Панель сравнения" className="mb-4 flex h-11 min-w-0 items-stretch rounded-lg border border-line bg-white [@media(pointer:fine)]:h-8">
        <div className="mr-auto flex min-w-0 md:hidden">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" aria-label={`Выбранные поставщики: ${count} из 4`} className="inline-flex max-w-full items-center gap-1.5 rounded-l-lg px-2.5 text-xs font-semibold text-ink hover:bg-soft">
                <GitCompareArrows size={14} className="shrink-0 text-brand-ink" aria-hidden="true" />
                <span className="hidden min-[384px]:inline">Выбрано</span><span className="num shrink-0 text-secondary">{count}/4</span>
                <ChevronDown size={13} className="shrink-0 text-secondary" aria-hidden="true" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} aria-label="Выбранные поставщики" className="z-40 max-h-(--radix-popover-content-available-height) w-[min(19rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-line bg-white p-2 shadow-xl md:hidden">
                <div className="border-b border-separator px-2 pb-2 text-xs font-semibold text-ink">Выбранные поставщики</div>
                <ul className="space-y-0.5 py-1">
                  {selected.map(s => <li key={s.id} className="flex min-h-10 items-center justify-between gap-2 pl-2 text-xs text-ink">
                    <span className="min-w-0 truncate" title={s.name}>{s.name}</span>
                    <button type="button" onClick={() => onRemove(s.id)} aria-label={`Удалить из выбранных: ${s.name}`} className="grid size-10 shrink-0 place-items-center rounded-md text-secondary hover:bg-soft hover:text-ink"><X size={15} aria-hidden="true" /></button>
                  </li>)}
                </ul>
                {count < 2 && <p className="px-2 pb-1 text-[11px] text-secondary">Выберите ещё поставщика</p>}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>

        <div className="hidden shrink-0 items-center gap-2 rounded-l-lg border-r border-line bg-soft px-3 text-xs font-semibold text-ink md:flex"><GitCompareArrows size={15} className="text-brand-ink" aria-hidden="true" /><span>Сравнение <span className="num ml-0.5 text-secondary">{count}/4</span></span></div>
        <div className="hidden min-w-0 flex-1 items-center gap-1.5 px-2 md:flex">
          {selected.map(s => <span key={s.id} className="inline-flex h-6 min-w-0 max-w-40 items-center gap-0.5 rounded border border-brand-line bg-brand-soft pl-2 pr-0.5 text-[11px] font-medium text-brand-ink"><span className="truncate" title={s.name}>{s.name}</span><button type="button" onClick={() => onRemove(s.id)} aria-label={`Удалить из выбранных: ${s.name}`} className="grid size-5 shrink-0 place-items-center rounded-sm hover:bg-white hover:text-ink"><X size={13} aria-hidden="true" /></button></span>)}
          {count < 2 && <span className="hidden shrink-0 pl-1 text-[11px] text-secondary lg:inline">Выберите ещё поставщика</span>}
        </div>
        <span role="status" className="sr-only">{count === 4 ? 'Выбраны 4 поставщика — максимум для сравнения.' : `Выбрано ${count} из 4.${count < 2 ? ' Выберите ещё поставщика.' : ''}`}</span>
        <button type="button" onClick={onClear} aria-label="Очистить сравнение" title="Очистить сравнение" className="grid w-10 shrink-0 place-items-center text-xs font-semibold text-secondary hover:bg-soft hover:text-ink md:w-auto md:px-3"><X size={15} className="md:hidden" aria-hidden="true" /><span className="hidden md:inline">Очистить</span></button>
        <button type="button" onClick={onCompare} disabled={count < 2} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-r-[7px] border-l border-brand-line bg-brand-soft px-2.5 text-xs font-semibold text-brand-ink hover:bg-brand-line disabled:border-line disabled:bg-soft disabled:text-secondary md:px-3">Сравнить ({count}) <ArrowRight size={14} aria-hidden="true" /></button>
    </div>
  );
}
