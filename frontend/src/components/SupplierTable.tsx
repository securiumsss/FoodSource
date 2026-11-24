import { requiresTemperatureControl } from '@food-suppliers/shared';
import type { SupplierStatus, SupplierWithEvaluation } from '@food-suppliers/shared';
import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Check, GitCompareArrows, Snowflake, Truck } from 'lucide-react';
import { getVerdictStyle, InlineStatusSelect, StatusBadge } from './ui';

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 20 });
const moqUnits = { RUB: '₽', KG: 'кг', BOX: 'кор.', PCS: 'шт.' };

function compactMoq({ amount, unit, label }: SupplierWithEvaluation['moq']): string {
  if (amount !== null && unit !== null) return 'от ' + numberFormat.format(amount) + ' ' + moqUnits[unit];

  // Only reuse an explicit lower bound; conflicting or unspecified quantities stay on request.
  const bounds = [...label.matchAll(/(?:^|[\s:—–(])(от\s+\d+(?:[ \u00a0\u202f]\d{3})*(?:[,.]\d+)?\s*(?:₽|руб\.?|кг|тонн[аы]?|т\.?|шт\.?|штук[аи]?|короб(?:а|ов|ки|ок)?|кор\.?|упаков(?:ки|ок|ка)|уп\.?))(?=$|[\s;,.)])/giu)];
  return bounds.length === 1 ? bounds[0][1].replace(/\s+/gu, ' ') : 'По запросу';
}

function compactPrice({ min, max, unit, label }: SupplierWithEvaluation['priceEstimate']): { amount: string; product: string } {
  let amount: string;
  if (min === null) {
    if (max === null) return { amount: 'По запросу', product: '' };
    amount = 'до ' + numberFormat.format(max);
  } else if (max === null) amount = 'от ' + numberFormat.format(min);
  else if (min !== max) amount = numberFormat.format(min) + '–' + numberFormat.format(max);
  else amount = numberFormat.format(min);

  const priceUnit = (unit ?? '').replace(/^RUB(?=\/|$)/i, '₽').replace(/\/упаковка$/iu, '/уп');
  if (priceUnit) amount += ' ' + priceUnit;

  // A dash/colon before a price separates the product from price qualifiers (VAT, availability, etc.).
  const separator = /\s*(?:[—–:]|\s-\s)\s*(?=(?:(?:от|до)\s+)?\d)/iu.exec(label);
  const product = separator ? label.slice(0, separator.index).trim() : '';
  return { amount, product };
}

interface Props {
  suppliers: SupplierWithEvaluation[];
  emptyContent?: ReactNode;
  selectedIds: string[];
  activeId: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  atLimit: boolean;
  savingId: string;
  dimmed: boolean;
  onOpen: (id: string) => void;
  onCompare: (supplier: SupplierWithEvaluation) => void;
  onStatusChange: (id: string, status: SupplierStatus) => void;
}

export function SupplierTable({
  suppliers,
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
      <div ref={viewportRef} className="@container min-h-0 flex-1 overflow-auto overscroll-contain" role="region" aria-label="Таблица поставщиков" tabIndex={0}>
        <table className="w-full md:min-w-[960px] table-fixed border-collapse text-left">
          <colgroup>
            <col className="w-10 md:w-[44px]" />
            <col />
            <col className="w-[37%] md:w-[clamp(205px,22%,340px)]" />
            <col className="hidden w-[16%] md:table-column" />
            <col className="hidden w-[13%] md:table-column" />
            <col className="hidden w-[118px] md:table-column" />
            <col className="hidden w-[152px] md:table-column" />
          </colgroup>
          <thead ref={headerRef} className="sticky top-0 z-10 bg-soft shadow-[inset_0_-1px_0_var(--color-line)]">
            <tr className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th scope="col" className="px-3 py-2.5 text-center" title="Выберите до 4 поставщиков для сравнения">
                <span className="sr-only">Выбор для сравнения</span>
                <GitCompareArrows size={14} aria-hidden="true" className="mx-auto" />
              </th>
              <th scope="col" className="px-3 py-2.5">Поставщик</th>
              <th scope="col" className="px-2 py-2.5 md:px-3"><span className="md:hidden">Мин. заказ / цена</span><span className="hidden md:inline">MOQ / Ориентир цены</span></th>
              <th scope="col" className="hidden px-3 py-2.5 md:table-cell">География и логистика</th>
              <th scope="col" className="hidden px-3 py-2.5 md:table-cell">Документы</th>
              <th scope="col" className="hidden px-3 py-2.5 md:table-cell">Оценка</th>
              <th scope="col" className="hidden px-3 py-2.5 md:table-cell">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-separator">
            {suppliers.length === 0 && emptyContent && (
              <tr>
                <td colSpan={7} className="p-0">
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
              const price = compactPrice(s.priceEstimate);

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
                    <p className="mt-0.5 text-[11px] text-muted">{s.city} · {s.categoryLabel}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 md:hidden">
                      <span className={'rounded border px-1.5 py-0.5 text-[10px] font-semibold ' + style.badge}>
                        <span className="num">{s.scoring.total}/100</span> · {style.shortLabel}
                      </span>
                      <StatusBadge status={s.workspace.status} />
                    </div>
                  </td>

                  <td className="px-2 py-3 align-top md:px-3">
                    <p title={s.moq.label} className="num truncate text-xs font-medium text-ink">{compactMoq(s.moq)}</p>
                    <p title={s.priceEstimate.label} className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-1 text-[11px] text-secondary md:flex-nowrap">
                      <span className="num shrink-0 whitespace-nowrap">{price.amount}</span>
                      {price.product && <><span aria-hidden="true" className="hidden md:inline">·</span><span className="min-w-0 basis-full break-words md:basis-auto md:truncate">{price.product}</span></>}
                    </p>
                  </td>

                  <td className="hidden px-3 py-3 align-top md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {s.regions.slice(0, 2).map(region => (
                        <span key={region} className="rounded border border-line bg-soft px-1.5 py-0.5 text-[10px] font-medium text-secondary">
                          {region}
                        </span>
                      ))}
                      {s.regions.length > 2 && <span className="num text-[10px] text-muted">+{s.regions.length - 2}</span>}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-secondary">
                      {s.delivery.hasOwnDelivery === true && (
                        <span className="inline-flex items-center gap-1" title="Своя доставка"><Truck size={11} className="text-ink" />Своя</span>
                      )}
                      {requiresTemperatureControl(s.category) && s.delivery.temperatureControlled === true && (
                        <span className="inline-flex items-center gap-1" title="Подтверждён температурный режим"><Snowflake size={11} className="text-ink" />Реф</span>
                      )}
                      {s.delivery.leadTime && <span title={s.delivery.leadTime} className="truncate text-muted">{s.delivery.leadTime}</span>}
                    </div>
                  </td>

                  <td className="hidden px-3 py-3 align-top md:table-cell">
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

                  <td className="hidden px-3 py-3 align-top md:table-cell">
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

                  <td className="hidden px-3 py-3 align-top md:table-cell">
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