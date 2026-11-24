import type { SupplierDetailResponse, SupplierProduct } from '@food-suppliers/shared';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { ExternalLink } from './ui';

const priceFormat = new Intl.NumberFormat('ru-RU');
const checkedDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' });
const pageSize = 12;
const normalize = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/(?<=\d),(?=\d)/gu, '.');
const tokens = (value: string) => normalize(value).match(/\p{L}+|\d+(?:\.\d+)?(?:\s*%)?/gu)?.map(token => token.replace(/\s+/gu, '')) ?? [];

export function describeProduct(product: SupplierProduct): string {
  return [product.name, product.pack].filter(Boolean).join(' — ');
}

export function SupplierAssortmentPanel({ supplier, matches, onRequest, initialSearch = '' }: {
  supplier: SupplierDetailResponse;
  matches: string[];
  initialSearch?: string;
  onRequest: (id: string) => void;
}) {
  const [query, setQuery] = useState(initialSearch);
  const [page, setPage] = useState(0);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0;
  }, [page, query]);

  const { assortment } = supplier;
  if (!assortment) {
    return <section className="min-h-0 space-y-3 overflow-y-auto text-xs text-secondary">
      <h3 className="text-sm font-semibold text-ink">Ассортимент поставщика</h3>
      <p>{supplier.description}</p>
      <p>Позиции этого поставщика пока не собраны. Уточните ассортимент и цены у поставщика.</p>
      {supplier.website && <ExternalLink href={supplier.website}>Сайт поставщика</ExternalLink>}
    </section>;
  }

  const matched = new Set(matches);
  const terms = tokens(query);
  const products = assortment.products.filter(product => {
    if (!terms.length) return true;
    const words = tokens(describeProduct(product));
    return terms.every(term => words.some(word => /^\d/u.test(term) ? word === term || word === term + '%' : word.startsWith(term)));
  }).sort((a, b) => Number(matched.has(b.id)) - Number(matched.has(a.id)));
  const pageCount = Math.ceil(products.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, pageCount - 1));
  const start = currentPage * pageSize;
  const visible = products.slice(start, start + pageSize);
  const hasPagination = assortment.products.length > pageSize;
  const resultLabel = products.length === 1 ? '1 позиция'
    : products.length ? `${start + 1}–${start + visible.length} из ${products.length}` : '0 позиций';
  return <section className="flex min-h-0 flex-1 flex-col gap-2.5">
    <div className="shrink-0 space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <h3 className="text-sm font-semibold text-ink">Ассортимент поставщика</h3>
        <ExternalLink href={assortment.catalogUrl}>На сайте поставщика</ExternalLink>
      </div>
      {assortment.groups.length > 0 && <div className="flex flex-wrap gap-1.5">
        {assortment.groups.map(group => <span key={group} className="rounded border border-line bg-soft px-2 py-1 text-xs text-secondary">{group}</span>)}
      </div>}
      {assortment.catalogNote && <p className="text-xs leading-snug text-secondary">{assortment.catalogNote}</p>}
    </div>
    {(hasPagination || Boolean(initialSearch)) && <label className="relative block shrink-0">
      <span className="sr-only">Поиск по ассортименту</span>
      <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input type="search" className="field field-search" style={{ paddingInlineStart: '2.25rem' }} placeholder="Товар или фасовка" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
    </label>}
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-line">
      <div ref={tableScrollRef} data-assortment-scroll className="min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-offset-[-2px]" role="region" aria-label="Позиции с сайта поставщика" tabIndex={0}>
        <table className="w-full min-w-[290px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-soft text-muted shadow-[0_1px_0_var(--color-line)]">
            <tr><th scope="col" className="px-2.5 py-2">Товар / фасовка</th><th scope="col" className="px-2.5 py-2">Цена на сайте</th><th scope="col" className="px-2.5 py-2">Источник</th></tr>
          </thead>
          <tbody className="divide-y divide-separator">
            {!visible.length && <tr><td colSpan={3} className="px-3 py-5 text-center text-secondary">
              {terms.length ? 'По вашему запросу ничего не найдено.' : 'Позиции пока не собраны.'}
            </td></tr>}
            {visible.map(product => <tr key={product.id} className={matched.has(product.id) ? 'bg-brand-soft/60' : undefined}>
              <td className="px-2.5 py-3 align-top">
                <p className="font-semibold text-ink">{product.name}</p>
                {product.pack && <p className="mt-1 text-[11px] text-secondary">{product.pack}</p>}
                <button type="button" aria-label={`В запрос КП: ${product.name}`} aria-description={product.pack ?? undefined} onClick={() => onRequest(product.id)} className="mt-1 inline-flex min-h-7 items-center gap-1 rounded text-[11px] font-semibold text-brand-ink hover:text-brand-ink-strong"><Plus size={12} aria-hidden="true" />В запрос КП</button>
              </td>
              <td className="px-2.5 py-3 align-top text-secondary">
                {product.price.kind === 'published' ? <>
                  <span className="num whitespace-nowrap font-medium text-ink">{priceFormat.format(product.price.amount)} ₽{product.price.unit ? `/${product.price.unit}` : ''}</span>
                  {!product.price.unit && <p className="mt-1 text-[11px]">Единицу уточнить</p>}
                </> : product.price.kind === 'on_request' ? 'По запросу' : 'Не опубликована'}
                {product.priceNote && <p className="mt-1 text-[11px]">{product.priceNote}</p>}
                {product.availabilityNote && <p className="mt-1 text-[11px] text-caution">{product.availabilityNote}</p>}
              </td>
              <td className="px-2.5 py-3 align-top">
                <ExternalLink href={product.sourceUrl}>{product.sourceKind === 'listing' ? 'Перечень' : 'Товар'}</ExternalLink>
                <time dateTime={product.checkedAt} title="Дата проверки" className="mt-1 block whitespace-nowrap text-[10px] text-muted">{checkedDate.format(new Date(product.checkedAt))}</time>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex min-h-10 shrink-0 items-center justify-between gap-2 border-t border-line bg-soft px-2.5 py-1 text-[11px] text-secondary">
        <p role="status">{resultLabel}</p>
        {hasPagination && <div role="group" aria-label="Страницы ассортимента" className="flex gap-1">
          <button type="button" className="icon-btn disabled:opacity-40" aria-label="Предыдущая страница ассортимента" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={14} /></button>
          <button type="button" className="icon-btn disabled:opacity-40" aria-label="Следующая страница ассортимента" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={14} /></button>
        </div>}
      </div>
    </div>
  </section>;
}
