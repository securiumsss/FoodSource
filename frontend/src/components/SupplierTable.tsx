import { getDeliveryCoverage } from '@food-suppliers/shared';
import type { SupplierCategory, SupplierRegion, SupplierStatus, SupplierWithEvaluation } from '@food-suppliers/shared';
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, GitCompareArrows } from 'lucide-react';
import { getVerdictStyle, InlineStatusSelect, StatusBadge } from './ui';

const shortCategory: Record<SupplierCategory, string> = {
  packaging: 'Упаковка',
  spices: 'Специи',
  dairy: 'Молочная',
  frozen: 'Заморозка',
};
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 20 });
const moqUnits = { RUB: '₽', KG: 'кг', BOX: 'кор.', PCS: 'шт.' };

function compactMoq({ amount, unit, label }: SupplierWithEvaluation['moq']): string {
  if (amount !== null && unit !== null) return 'от ' + numberFormat.format(amount) + ' ' + moqUnits[unit];

  // Only reuse an explicit lower bound; conflicting or unspecified quantities stay on request.
  const bounds = [...label.matchAll(/(?:^|[\s:—–(])(от\s+\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?\s*(?:₽|руб\.?|кг|тонн[аы]?|т\.?|шт\.?|штук[аи]?|короб(?:а|ов|ки|ок)?|кор\.?|упаков(?:ки|ок|ка)|уп\.?))(?=$|[\s;,.)])/giu)];
  return bounds.length === 1 ? bounds[0][1].replace(/\s+/gu, ' ') : 'По запросу';
}

function AssortmentPreview({ supplier, onOpen }: { supplier: SupplierWithEvaluation; onOpen: () => void }) {
  const { matchedProducts = [], assortmentGroups = [] } = supplier;
  const match = matchedProducts[0];
  const groupLimit = 3;
  if (!match && !assortmentGroups.length) return <span className="text-[11px] text-muted">Позиции не собраны</span>;

  const text = match ? `Найдено: ${match.name}` : assortmentGroups.slice(0, groupLimit).join(' · ');
  const more = match ? (supplier.matchedProductCount ?? matchedProducts.length) - 1 : assortmentGroups.length - groupLimit;
  const title = match
    ? matchedProducts.map(product => [product.name, product.pack].filter(Boolean).join(' · ')).join('\n')
    : assortmentGroups.join(' · ');

  return (
    <button
      type="button"
      title={title}
      onClick={event => { event.stopPropagation(); onOpen(); }}
      className={`inline-flex max-w-full items-start gap-1 text-left text-xs hover:underline ${match ? 'font-semibold text-brand-ink-strong' : 'text-secondary hover:text-brand-ink-strong'}`}
    >
      <span className="min-w-0">
        <span className="line-clamp-2 break-words">{text}</span>
        {(match?.pack || more > 0) && <span className="mt-0.5 block truncate text-[11px] font-normal text-secondary">
          {[match?.pack, more > 0 ? (match ? `ещё совпадения: ${more}` : `ещё групп: ${more}`) : null].filter(Boolean).join(' · ')}
        </span>}
      </span>
      <ArrowUpRight size={12} aria-hidden="true" className="mt-0.5 shrink-0 text-brand-ink" />
    </button>
  );
}

function DeliveryRegions({ regions, regionFilter }: { regions: SupplierRegion[]; regionFilter?: string }) {
  const federal = 'Вся РФ';
  const local = regions.filter(region => region !== federal);
  const matching = regionFilter && (local.find(region => region === regionFilter)
    ?? local.find(region => getDeliveryCoverage([region], regionFilter) === 'local'));
  const prioritized = regions.includes(federal)
    ? (matching ? [matching, federal] : [federal])
    : (matching ? [matching, ...local.filter(region => region !== matching)] : local);
  const visible = prioritized.slice(0, 2);
  const remaining = prioritized.slice(2);

  if (!visible.length) return <span className="text-[11px] text-muted">Не указаны</span>;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map(region => (
        <span key={region} className="rounded border border-line bg-soft px-1.5 py-0.5 text-[10px] font-medium text-secondary">
          {region}
        </span>
      ))}
      {remaining.length > 0 && <span className="num text-[10px] text-muted" title={remaining.join(', ')}>
        <span aria-hidden="true">+{remaining.length}</span>
        <span className="sr-only">Также: {remaining.join(', ')}</span>
      </span>}
    </div>
  );
}

interface Props {
  suppliers: SupplierWithEvaluation[];
  scrollKey: string;
  regionFilter?: string;
  emptyContent?: ReactNode;
  selectedIds: string[];
  activeId: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  atLimit: boolean;
  savingId: string;
  dimmed: boolean;
  onOpen: (id: string, tab?: 'assortment') => void;
  onCompare: (supplier: SupplierWithEvaluation) => void;
  onStatusChange: (id: string, status: SupplierStatus) => void;
}

export function SupplierTable({
  suppliers,
  scrollKey,
  regionFilter,
  emptyContent,
  selectedIds,
  activeId,
  returnFocusRef,
  atLimit,
  savingId,
  dimmed,
  onOpen,
  onCompare,
  onStatusChange,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);
  const viewportId = useId();
  const [scrolledRight, setScrolledRight] = useState(false);

  useLayoutEffect(() => {
    if (viewportRef.current) viewportRef.current.scrollTop = 0;
  }, [scrollKey]);

  useLayoutEffect(() => {
    if (!activeId) return;
    const viewport = viewportRef.current;
    const header = headerRef.current;
    const row = viewport?.querySelector<HTMLTableRowElement>('tr[aria-current="true"]');
    if (!viewport || !header || !row) return;

    returnFocusRef.current = row;
    const { top, bottom } = row.getBoundingClientRect();
    const visibleTop = header.getBoundingClientRect().bottom;
    const visibleBottom = viewport.getBoundingClientRect().top + viewport.clientHeight;
    if (top < visibleTop) viewport.scrollTop += Math.floor(top - visibleTop);
    else if (bottom > visibleBottom) viewport.scrollTop += Math.ceil(bottom - visibleBottom);
  }, [activeId, suppliers, returnFocusRef]);

  return (
    <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-y border-line bg-white transition-opacity ${dimmed ? 'opacity-60' : ''}`}>
      {suppliers.length > 0 && <button
        type="button"
        aria-controls={viewportId}
        className="flex min-h-7 shrink-0 items-center justify-end gap-1.5 border-b border-separator bg-white px-3 text-[11px] font-medium text-brand-ink md:hidden"
        onClick={() => { const viewport = viewportRef.current; if (viewport) viewport.scrollLeft = scrolledRight ? 0 : viewport.scrollWidth; }}
      >
        {scrolledRight && <ArrowLeft size={13} aria-hidden="true" />}
        {scrolledRight ? 'К началу таблицы' : 'Ещё столбцы'}
        {!scrolledRight && <ArrowRight size={13} aria-hidden="true" />}
      </button>}
      <div id={viewportId} ref={viewportRef} className="@container min-h-0 flex-1 overflow-auto overscroll-contain" role="region" aria-label="Таблица поставщиков" tabIndex={0} onScroll={event => setScrolledRight(event.currentTarget.scrollLeft > 8)}>
        {/* On mobile the first three columns occupy one viewport; the remaining columns scroll into view. */}
        <table className="w-full table-fixed border-collapse text-left max-md:w-[calc(100cqw+688px)] md:min-w-[1080px]">
          <colgroup>
            <col className="w-10 md:w-[44px]" />
            <col className="max-md:w-[calc(55cqw-40px)]" />
            <col className="w-[45cqw] md:w-[clamp(205px,22%,340px)]" />
            <col className="w-[120px]" />
            <col className="w-[166px] md:w-[16%]" />
            <col className="w-[134px] md:w-[13%]" />
            <col className="w-[118px]" />
            <col className="w-[150px] md:w-[152px]" />
          </colgroup>
          <thead ref={headerRef} className="sticky top-0 z-10 bg-soft shadow-[inset_0_-1px_0_var(--color-line)]">
            <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th scope="col" className="px-3 py-2.5 text-center" title="Выберите до 4 поставщиков для сравнения">
                <span className="sr-only">Выбор для сравнения</span>
                <GitCompareArrows size={14} aria-hidden="true" className="mx-auto" />
              </th>
              <th scope="col" className="px-3 py-2.5">Поставщик</th>
              <th scope="col" className="px-2 py-2.5 md:px-3">Ассортимент</th>
              <th scope="col" className="px-3 py-2.5 max-md:border-l max-md:border-line">Мин. заказ</th>
              <th scope="col" className="px-3 py-2.5">Куда доставляют</th>
              <th scope="col" className="px-3 py-2.5">Документы</th>
              <th scope="col" className="px-3 py-2.5">Оценка</th>
              <th scope="col" className="px-3 py-2.5">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-separator">
            {suppliers.length === 0 && emptyContent && (
              <tr>
                <td colSpan={8} className="p-0">
                  <div className="sticky left-0 w-[100cqw] px-4 py-10 text-center sm:px-6">
                    {emptyContent}
                  </div>
                </td>
              </tr>
            )}
            {suppliers.map(s => {
              const isSelected = selectedIds.includes(s.id);
              const isActive = s.id === activeId;
              const style = getVerdictStyle(s.scoring.verdict);
              const compliance = [...s.documents, ...s.complianceSystems];

              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen(s.id)}
                  tabIndex={0}
                  aria-current={isActive || undefined}
                  aria-haspopup="dialog"
                  aria-label={`Открыть карточку поставщика ${s.name}`}
                  onKeyDown={event => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onOpen(s.id);
                    }
                  }}
                  className={`group cursor-pointer transition-colors ${
                    isActive ? 'bg-brand-soft shadow-[inset_0_0_0_1px_var(--color-brand-line)]' : isSelected ? 'bg-brand-soft/50 hover:bg-brand-soft' : 'hover:bg-soft'
                  }`}
                >
                  <td className={`px-1 py-3 align-top text-center md:px-3 ${isActive ? 'shadow-[inset_3px_0_0_var(--color-brand)]' : ''}`}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={isSelected ? `Убрать ${s.name} из сравнения` : `Сравнить ${s.name}`}
                      disabled={!isSelected && atLimit}
                      title={!isSelected && atLimit ? 'Можно сравнить не более 4 поставщиков' : isSelected ? 'Убрать из сравнения' : 'Добавить к сравнению'}
                      onClick={event => { event.stopPropagation(); onCompare(s); }}
                      className={`mt-0.5 inline-flex h-8 w-8 md:h-4 md:w-4 items-center justify-center rounded border transition-colors ${
                        isSelected
                          ? 'border-graphite bg-graphite text-white'
                          : 'border-muted bg-white text-transparent hover:border-graphite'
                      }`}
                    >
                      <Check size={11} />
                    </button>
                  </td>

                  <td className="py-3 pr-1.5 align-top md:px-3">
                    <span className="text-[13px] font-semibold text-ink group-hover:text-brand-ink-strong">{s.name}</span>
                    <p className="mt-0.5 text-[11px] text-muted">{s.city} · <span className="md:hidden">{shortCategory[s.category]}</span><span className="hidden md:inline">{s.categoryLabel}</span></p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 md:hidden">
                      <span className={'rounded border px-1.5 py-0.5 text-[10px] font-semibold ' + style.badge}>
                        <span className="num">{s.scoring.total}/100</span> · {style.shortLabel}
                      </span>
                      <StatusBadge status={s.workspace.status} />
                    </div>
                  </td>

                  <td className="px-2 py-3 align-top md:px-3">
                    <AssortmentPreview supplier={s} onOpen={() => onOpen(s.id, 'assortment')} />
                  </td>

                  <td className="px-3 py-3 align-top max-md:border-l max-md:border-line">
                    <p title={s.moq.label} className="num truncate text-xs font-medium text-ink">{compactMoq(s.moq)}</p>
                  </td>

                  <td className="px-3 py-3 align-top">
                    <DeliveryRegions regions={s.regions} regionFilter={regionFilter} />
                  </td>

                  <td className="px-3 py-3 align-top">
                    {compliance.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {compliance.slice(0, 2).map((item, idx) => (
                          <span key={`${item}-${idx}`} className="max-w-full truncate rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-medium text-secondary" title={item}>
                            {item}
                          </span>
                        ))}
                        {compliance.length > 2 && <span className="num rounded bg-canvas px-1.5 py-0.5 text-[10px] text-secondary">+{compliance.length - 2}</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>

                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <span className="num text-xs font-semibold text-ink">{s.scoring.total}</span>
                      <div className="h-1 w-14 overflow-hidden rounded-full bg-line">
                        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.max(0, Math.min(100, s.scoring.total))}%` }} />
                      </div>
                    </div>
                    <p className={`mt-1 whitespace-nowrap text-[11px] ${s.scoring.verdict === 'clarify' ? 'text-caution' : s.scoring.verdict === 'recommended' ? 'text-positive' : 'text-secondary'}`}>
                      {style.shortLabel}
                    </p>
                  </td>

                  <td className="px-3 py-3 align-top">
                    <InlineStatusSelect
                      status={s.workspace.status}
                      saving={savingId === s.id}
                      label={`Статус для ${s.name}`}
                      onChange={next => onStatusChange(s.id, next)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}