import type { SupplierAssortment, SupplierProduct } from '@food-suppliers/shared';

const checkedAt = '2026-11-24';
const published = (amount: number, unit: string | null): SupplierProduct['price'] => ({ kind: 'published', amount, unit });
const onRequest: SupplierProduct['price'] = { kind: 'on_request' };

// Curated examples from public product pages; never treated as a full catalog or live inventory.
const catalogs = new Map<string, SupplierAssortment>([
  ['sup-dairy-01', {
    catalogUrl: 'https://vosttorg.ru/molochnye-produkty/',
    groups: ['Молоко и сливки', 'Сливочное масло и спреды', 'Сыры'],
    products: [
      {
        id: 'amanda-33-1l', name: 'Сливки ультрапастеризованные Amanda 33%', pack: '1 л',
        price: published(430, 'шт.'), availabilityNote: 'На дату проверки на сайте: нет в наличии',
        sourceUrl: 'https://vosttorg.ru/slivki-amanda-33-1l-jpg/', checkedAt,
      },
      {
        id: 'povarskoe-825-5kg', name: 'Масло сливочное «Поварское» 82,5% ГОСТ', pack: 'Монолит 5 кг',
        price: published(745, 'кг'), sourceUrl: 'https://vosttorg.ru/maslo-slivochnoe-povarskoe-82-5-5kg/', checkedAt,
      },
      {
        id: 'rogachev-85-20kg', name: 'Сгущённое молоко «Рогачёв» 8,5%', pack: 'Коробка 20 кг',
        price: published(265, 'кг'), priceNote: 'Акционная цена на дату проверки',
        sourceUrl: 'https://vosttorg.ru/sguschennoe-celnoe-moloko-8-5-rmkk-belarus-korobka-20kg/', checkedAt,
      },
    ],
  }],
  ['sup-dairy-02', {
    catalogUrl: 'https://agroparkspb.ru/molochnaya-produktsiya',
    groups: ['Сыры', 'Сливочное масло, маргарин и спреды', 'Йогурты и творог'],
    products: [
      {
        id: 'adygeysky-45-300g', name: 'Адыгейский сыр 45%, Молзавод Новый', pack: '300 г',
        price: published(258, null), sourceUrl: 'https://agroparkspb.ru/molochnaya-produktsiya/siri/adygeyskiy-syr-45-vak-up-molzavod-novyy-300-g', checkedAt,
      },
      {
        id: 'altaysky-50', name: 'Сыр «Алтайский кудесник» 50%', pack: 'Брус; вес не указан',
        price: published(993, null), sourceUrl: 'https://agroparkspb.ru/molochnaya-produktsiya/siri/altayskiy-kudesnik-syr-50-brus-kholod-altayskiy-kudesnik', checkedAt,
      },
    ],
  }],
  ['sup-dairy-03', {
    catalogUrl: 'https://rs-line.ru/katalog-produkcii',
    groups: ['Сливки', 'Молоко', 'Сливочное масло', 'Сыры'],
    products: [
      {
        id: 'barista-line-33-1l', name: 'Сливки Barista Line 33%', pack: '1 л',
        price: onRequest, sourceUrl: 'https://rs-line.ru/katalog/slivki/slivki-barista-line-33-1-l', checkedAt,
      },
      {
        id: 'milkavita-33-05l', name: 'Сливки «Милкавита» 33%', pack: '0,5 л',
        price: onRequest, sourceUrl: 'https://rs-line.ru/katalog/slivki/slivki-milkavita-33-0-5-l', checkedAt,
      },
      {
        id: 'creamart-33-1l', name: 'Комбинированные сливки Creamart 33%', pack: '1 л',
        price: onRequest, sourceUrl: 'https://rs-line.ru/katalog/slivki/kombinirovannye-slivki-creamart-33-1-l', checkedAt,
      },
    ],
  }],
]);

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
