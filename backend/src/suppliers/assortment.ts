import type { SupplierAssortment, SupplierProduct } from '@food-suppliers/shared';
import snapshot from './assortment.snapshot.json';

const catalogs = new Map(Object.entries(snapshot as Record<string, SupplierAssortment>));
export const getAssortment = (supplierId: string) => catalogs.get(supplierId);

const normalize = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е');
const tokens = (value: string) => normalize(value).match(/\p{L}+|\d+(?:[.,]\d+)?(?:\s*%)?/gu)
  ?.map(token => token.replace(',', '.').replace(/\s+/gu, '')) ?? [];

export function findProducts(supplierId: string, search: string | undefined): SupplierProduct[] {
  if (!search) return [];
  const terms = tokens(search);
  if (!terms.length) return [];
  return getAssortment(supplierId)?.products.filter(product => {
    const words = tokens(`${product.name} ${product.pack ?? ''}`);
    return terms.every(term => words.some(word => /^\d/u.test(term)
      ? word === term || word === `${term}%`
      : word.startsWith(term)));
  }) ?? [];
}

export function productPrice(product: SupplierProduct): string {
  if (product.price.kind === 'published') {
    const { amount, unit } = product.price;
    return `${amount.toLocaleString('ru')} ₽${unit ? `/${unit}` : ' (единицу уточнить)'}`;
  }
  return product.price.kind === 'on_request' ? 'Цена по запросу' : 'Цена не опубликована';
}
