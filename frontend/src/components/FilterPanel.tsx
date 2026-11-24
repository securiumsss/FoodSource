import { requiresTemperatureControl } from '@food-suppliers/shared';
import type { SupplierCategory, SupplierStatus, SuppliersListResponse, SuppliersQueryParams } from '@food-suppliers/shared';
import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import { FilterSelect } from './FilterSelect';
import { statusLabels, statuses } from './ui';

type Facets = SuppliersListResponse['facets'];

interface Props {
  filters: SuppliersQueryParams;
  onChange: (patch: Partial<SuppliersQueryParams>) => void;
  onReset: () => void;
  facets: Facets | null;
  active: boolean;
}

const booleanFilters = [
  ['hasCompliance', 'Есть документы или системы прослеживаемости', 'Документы или комплаенс'],
  ['hasPriceEstimate', 'Есть ориентир цены', 'Есть ориентир цены'],
  ['temperatureControlled', 'Подтверждён температурный режим', 'Температурный режим'],
  ['hasOwnDelivery', 'Своя доставка', 'Своя доставка'],
] as const;

const rubAmount = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 20 });

export interface ActiveFilterChip {
  key: keyof SuppliersQueryParams;
  label: string;
  shortLabel?: string;
  clear: Partial<SuppliersQueryParams>;
}

export function getActiveFilterChips(filters: SuppliersQueryParams): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (filters.region) chips.push({ key: 'region', label: 'Регион: ' + filters.region, shortLabel: filters.region, clear: { region: undefined } });
  for (const [key, , label] of booleanFilters) {
    if (filters[key] === true) chips.push({ key, label, clear: { [key]: undefined } });
  }
  if (filters.maxMoqRub !== undefined) {
    chips.push({
      key: 'maxMoqRub',
      label: 'MOQ до ' + rubAmount.format(filters.maxMoqRub) + ' ₽',
      clear: { maxMoqRub: undefined, includeUnknownMoq: undefined },
    });
  }
  return chips;
}

const all = '__all__';
const sortOptions = [
  { value: 'score', label: 'По рекомендации' },
  { value: 'moq_asc', label: 'По мин. заказу' },
  { value: 'name_asc', label: 'По названию' },
  { value: 'updated', label: 'Недавно обновлённые' },
] as const satisfies readonly { value: NonNullable<SuppliersQueryParams['sortBy']>; label: string }[];

export function FilterPanel({ filters, onChange, onReset, facets, active }: Props) {
  const coldFilterHint = useId();
  const coldFilterDisabled = Boolean(filters.category && !requiresTemperatureControl(filters.category));
  const total = facets?.categories.reduce((sum, category) => sum + category.count, 0) ?? 0;

  return (
    <section aria-label="Дополнительные фильтры" className="p-4">
      <div className="grid items-start gap-5 md:grid-cols-3">
        <div className="md:col-span-3 lg:hidden">
          <p className="filter-label">Категория товара</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={!filters.category}
              aria-label={`Все категории: ${total}`}
              onClick={() => onChange({ category: undefined })}
              className={`pill-toggle ${!filters.category ? 'pill-toggle-active' : ''}`}
            >
              <span>Все категории</span>
              <span className="num text-[10px] opacity-70">{total}</span>
            </button>
            {facets?.categories.map(category => {
              const isSelected = filters.category === category.value;
              return (
                <button
                  key={category.value}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${category.label}: ${category.count}`}
                  onClick={() => onChange({ category: isSelected ? undefined : (category.value as SupplierCategory) })}
                  className={`pill-toggle ${isSelected ? 'pill-toggle-active' : ''}`}
                >
                  <span>{category.label}</span>
                  <span className="num text-[10px] opacity-70">{category.count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="min-w-0 space-y-3">
          <div>
            <FilterSelect
              label="Регион"
              value={filters.region ?? all}
              options={[{ value: all, label: 'Все регионы' }, ...(facets?.regions ?? []).map(region => ({ value: region, label: region }))]}
              onChange={region => onChange({ region: region === all ? undefined : region })}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Поставщики с доставкой по всей России тоже учитываются.
            </p>
          </div>
          <FilterSelect
            label="Сортировка"
            value={filters.sortBy ?? 'score'}
            options={sortOptions}
            onChange={sortBy => onChange({ sortBy: sortBy === 'score' ? undefined : sortBy })}
          />
          <FilterSelect<SupplierStatus | typeof all>
            label="Статус работы"
            value={filters.status ?? all}
            options={[{ value: all, label: 'Все статусы' }, ...statuses.map(status => ({ value: status, label: statusLabels[status] }))]}
            onChange={status => onChange({ status: status === all ? undefined : status })}
          />
        </div>
        <fieldset className="min-w-0 space-y-2">
          <legend className="filter-label mb-2.5">Условия поставщика</legend>
          {booleanFilters.map(([key, label]) => {
            const disabled = key === 'temperatureControlled' && coldFilterDisabled;
            return (
              <label key={key} className="check-label items-start has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
                <input type="checkbox" className="mt-0.5 shrink-0" disabled={disabled} aria-describedby={disabled ? coldFilterHint : undefined} checked={filters[key] === true} onChange={event => onChange({ [key]: event.target.checked ? true : undefined })} />
                <span>{label}</span>
              </label>
            );
          })}
          {coldFilterDisabled && <p id={coldFilterHint} className="text-[11px] text-secondary">Температурный режим применяется только для молочной продукции и заморозки.</p>}
        </fieldset>

        <div className="min-w-0">
          <label htmlFor="moq" className="filter-label block">Лимит минимального заказа, ₽</label>
          <div className="relative mt-1">
            <input
              id="moq"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="Например, 15 000"
              className="field h-9 appearance-none px-2.5 py-0 pr-7 text-[13px]! [&::-webkit-inner-spin-button]:appearance-none"
              value={filters.maxMoqRub ?? ''}
              onChange={event =>
                onChange(event.target.value === ''
                  ? { maxMoqRub: undefined, includeUnknownMoq: undefined }
                  : { maxMoqRub: Math.max(0, Number(event.target.value)) })
              }
            />
            <span aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">₽</span>
          </div>
          <label className="check-label mt-2.5 items-start has-[:disabled]:cursor-default has-[:disabled]:opacity-60">
            <input
              type="checkbox"
              className="mt-0.5 shrink-0"
              disabled={filters.maxMoqRub === undefined}
              checked={filters.includeUnknownMoq !== false}
              onChange={event => onChange({ includeUnknownMoq: event.target.checked ? undefined : false })}
            />
            <span>Включать поставщиков без минимума в ₽</span>
          </label>
        </div>
      </div>
      {active && (
        <div className="mt-3 flex justify-end border-t border-line pt-2">
          <button type="button" onClick={onReset} className="btn-ghost text-ink">
            <RotateCcw size={13} />
            Сбросить все фильтры
          </button>
        </div>
      )}
    </section>
  );
}