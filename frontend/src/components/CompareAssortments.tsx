import type { CSSProperties } from 'react';
import type { CompareResponse, SupplierProduct, SupplierWithEvaluation } from '@food-suppliers/shared';
import { ArrowUpRight, X } from 'lucide-react';
import { ExternalLink } from './ui';
import { estimatePurchase, formatEstimateCost, formatPurchaseQuantity, unmetMinimum, type PurchaseQuantity } from './purchaseEstimate';

const number = new Intl.NumberFormat('ru-RU');

function ProductRow({ product, quantity, moq }: { product: SupplierProduct; quantity?: PurchaseQuantity; moq: SupplierWithEvaluation['moq'] }) {
  const { price } = product;
  const estimate = quantity && estimatePurchase(product, quantity);
  const minimum = estimate && unmetMinimum(moq, estimate);
  return (
    <li className="grid gap-x-3 gap-y-1 px-3.5 py-2.5 min-[360px]:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <p className="break-words font-medium text-ink">{product.name}</p>
        {product.pack && <p className="mt-0.5 text-[11px] text-secondary">{product.pack}</p>}
      </div>
      <div className="min-[360px]:text-right">
        {price.kind === 'published' ? <>
          <span className="num font-semibold text-ink">{number.format(price.amount)} ₽{price.unit ? `/${price.unit}` : ''}</span>
          {!price.unit && <p className="text-[11px] text-secondary">Единицу уточнить</p>}
        </> : <span className="text-[11px] text-secondary">{price.kind === 'on_request' ? 'Цена по запросу' : 'Цена не опубликована'}</span>}
        <div className="mt-0.5 text-[11px]"><ExternalLink href={product.sourceUrl}>Источник</ExternalLink></div>
      </div>
      {(product.priceNote || product.availabilityNote) && <div className="space-y-0.5 text-[11px] min-[360px]:col-span-2">
        {product.availabilityNote && <p className="text-caution">{product.availabilityNote}</p>}
        {product.priceNote && <p className="text-secondary">{product.priceNote}</p>}
      </div>}
      {quantity && (estimate ? (
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded border border-brand-line bg-brand-soft px-2 py-1.5 text-[11px] min-[360px]:col-span-2">
          <span className="text-secondary">{number.format(estimate.packs)} уп. · {formatPurchaseQuantity(estimate.purchased)}{estimate.surplus && ' (с запасом)'}</span>
          <span className="num whitespace-nowrap font-semibold text-brand-ink-strong">≈ {formatEstimateCost(estimate.cost)}</span>
          {minimum && <span className="basis-full text-caution">Ниже минимума поставщика: от {minimum}</span>}
        </div>
      ) : <p className="mt-1 text-[11px] text-secondary min-[360px]:col-span-2">Недостаточно данных для расчёта на этот объём</p>)}
    </li>
  );
}

export function CompareAssortments({ result, query, quantity, onOpen, onRemove }: {
  result: CompareResponse;
  query: string;
  quantity?: PurchaseQuantity;
  onOpen: (id: string, query: string) => void;
  onRemove?: (id: string) => void;
}) {
  const pairs: SupplierWithEvaluation[][] = [];
  for (let i = 0; i < result.suppliers.length; i += 2) pairs.push(result.suppliers.slice(i, i + 2));
  return (
    <div className="space-y-3">
      {pairs.map(pair => {
        const rows = Math.max(1, ...pair.map(supplier => result.assortments[supplier.id]?.shown.length ?? 0));
        // Each desktop pair shares the header, product, and footer tracks.
        return <div key={pair[0].id} className="grid gap-3 sm:grid-cols-2 sm:gap-y-0" style={{ '--product-rows': rows, '--catalog-rows': rows + 2 } as CSSProperties}>
          {pair.map(supplier => {
            const catalog = result.assortments[supplier.id];
            return (
              <article key={supplier.id} aria-label={`Ассортимент: ${supplier.name}`} className="min-w-0 rounded-lg border border-line bg-white text-xs sm:row-span-[var(--catalog-rows)] sm:grid sm:grid-rows-subgrid">
                <header className="sticky top-0 z-10 space-y-2 rounded-t-[7px] border-b border-line bg-soft px-3.5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="break-words text-sm font-semibold text-ink">{supplier.name}</h3>
                    <div className="flex items-center gap-2">
                      {catalog && <span className="text-[11px] text-secondary">{query ? `${catalog.matchingApproximate ? 'Похожие позиции' : 'Совпадений'}: ${catalog.matchingTotal ?? 0}` : `Позиций собрано: ${catalog.total}`}</span>}
                      {onRemove && <button type="button" onClick={() => onRemove(supplier.id)} aria-label={`Убрать из сравнения: ${supplier.name}`} className="grid size-7 place-items-center rounded text-secondary hover:bg-line hover:text-ink"><X size={14} aria-hidden="true" /></button>}
                    </div>
                  </div>
                  {!query && catalog && catalog.groups.length > 0 && <ul className="flex flex-wrap gap-1">
                    {catalog.groups.map(group => <li key={group} className="rounded border border-line bg-white px-1.5 py-0.5 text-[11px] text-secondary">{group}</li>)}
                  </ul>}
                </header>
                {catalog?.shown.length ? <ul className="divide-y divide-separator sm:row-span-[var(--product-rows)] sm:grid sm:grid-rows-subgrid">
                  {catalog.shown.map(product => <ProductRow key={product.id} product={product} quantity={quantity} moq={supplier.moq} />)}
                </ul> : <p className="px-3.5 py-4 leading-relaxed text-secondary sm:row-span-[var(--product-rows)]">
                  {!catalog || !catalog.total ? 'Позиции этого поставщика пока не собраны.' : 'В собранных позициях совпадений нет. Это не означает, что товара нет у поставщика.'}
                </p>}
                <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-3.5 py-2">
                  <button type="button" onClick={() => onOpen(supplier.id, query)} aria-label={`Открыть ассортимент: ${supplier.name}`} className="inline-flex min-h-7 items-center gap-1 font-medium text-brand-ink hover:underline">
                    {query && catalog && (catalog.matchingTotal ?? 0) > catalog.shown.length ? `${catalog.matchingApproximate ? 'Все похожие' : 'Все совпадения'} (${catalog.matchingTotal})` : 'Открыть ассортимент'} <ArrowUpRight aria-hidden="true" size={13} />
                  </button>
                  {catalog && <ExternalLink href={catalog.catalogUrl}>Сайт поставщика</ExternalLink>}
                </footer>
              </article>
            );
          })}
        </div>;
      })}
    </div>
  );
}
