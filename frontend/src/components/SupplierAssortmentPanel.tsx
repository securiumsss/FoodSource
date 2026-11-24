import type { SupplierDetailResponse, SupplierProduct } from '@food-suppliers/shared';
import { Plus } from 'lucide-react';
import { ExternalLink } from './ui';

const priceFormat = new Intl.NumberFormat('ru-RU');
const checkedDate = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' });

export function describeProduct(product: SupplierProduct): string {
  return [product.name, product.pack].filter(Boolean).join(' — ');
}

export function SupplierAssortmentPanel({ supplier, matches, onRequest }: {
  supplier: SupplierDetailResponse;
  matches: string[];
  onRequest: (id: string) => void;
}) {
  const { assortment } = supplier;
  if (!assortment) {
    return <section className="space-y-3 text-xs text-secondary">
      <h3 className="text-sm font-semibold text-ink">Ассортимент поставщика</h3>
      <p>{supplier.description}</p>
      <p>Позиции этого поставщика пока не собраны. Уточните ассортимент и цены у поставщика.</p>
      {supplier.website && <ExternalLink href={supplier.website}>Сайт поставщика</ExternalLink>}
    </section>;
  }

  const products = [...assortment.products].sort((a, b) => Number(matches.includes(b.id)) - Number(matches.includes(a.id)));
  return <section className="space-y-4">
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">Ассортимент поставщика</h3>
      <div className="flex flex-wrap gap-1.5">
        {assortment.groups.map(group => <span key={group} className="rounded border border-line bg-soft px-2 py-1 text-xs text-secondary">{group}</span>)}
      </div>
      <ExternalLink href={assortment.catalogUrl}>Открыть каталог поставщика</ExternalLink>
    </div>
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-ink">Позиции из открытого каталога</h4>
      <p className="text-xs leading-relaxed text-secondary">Это часть ассортимента, а не полный прайс. Перед заказом подтвердите наличие и оптовую цену.</p>
      <div className="overflow-x-auto rounded-lg border border-line" role="region" aria-label="Позиции из открытого каталога" tabIndex={0}>
        <table className="w-full min-w-[290px] text-left text-xs">
          <thead className="bg-soft text-muted">
            <tr><th scope="col" className="px-2.5 py-2">Товар / фасовка</th><th scope="col" className="px-2.5 py-2">Цена на сайте</th><th scope="col" className="px-2.5 py-2">Источник</th></tr>
          </thead>
          <tbody className="divide-y divide-separator">
            {products.map(product => <tr key={product.id} className={matches.includes(product.id) ? 'bg-brand-soft/60' : undefined}>
              <td className="px-2.5 py-3 align-top">
                <p className="font-semibold text-ink">{product.name}</p>
                {product.pack && <p className="mt-1 text-[11px] text-secondary">{product.pack}</p>}
                <button type="button" aria-label={`В запрос КП: ${product.name}`} onClick={() => onRequest(product.id)} className="mt-1 inline-flex min-h-7 items-center gap-1 rounded text-[11px] font-semibold text-brand-ink hover:text-brand-ink-strong"><Plus size={12} aria-hidden="true" />В запрос КП</button>
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
                <ExternalLink href={product.sourceUrl}>Товар</ExternalLink>
                <time dateTime={product.checkedAt} title="Дата проверки" className="mt-1 block whitespace-nowrap text-[10px] text-muted">{checkedDate.format(new Date(product.checkedAt))}</time>
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </section>;
}
