import type { SupplierProduct } from './api.types';

const tokens = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е')
  .match(/\p{L}+|\d+(?:[.,]\d+)?(?:\s*%)?/gu)
  ?.map(token => token.replace(/^копченн/u, 'копчен').replace(',', '.').replace(/\s+/gu, '')) ?? [];

const matchesWord = (word: string, term: string) => /^\d/u.test(term)
  ? word === term || word === `${term}%`
  : word.startsWith(term);

export function findProductMatches(products: SupplierProduct[], query: string) {
  const terms = [...new Set(tokens(query))];
  const exact: SupplierProduct[] = [];
  const similar: SupplierProduct[] = [];
  if (!terms.length) return { exact, similar };
  const seen = new Set<string>();
  for (const product of products) {
    const name = tokens(product.name);
    const words = [...name, ...tokens(product.pack ?? '')];
    const missing = terms.filter(term => !words.some(word => matchesWord(word, term)));
    // A missing grind descriptor is only a fallback; never relax the product, flavor, or pack requirements.
    if (missing.length && !(missing.length === 1 && /^молот(?:ая|ый|ое|ые|ой|ого|ую|ых)?$/u.test(missing[0])
      && terms.filter(term => term.length >= 4 && /^\p{L}/u.test(term) && name.some(word => matchesWord(word, term))).length >= 2)) continue;

    const identity = JSON.stringify([
      product.name.trim().replace(/\.$/u, '').trim(), product.pack, product.price, product.sourceUrl,
      product.priceNote, product.availabilityNote, product.checkedAt,
    ]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    (missing.length ? similar : exact).push(product);
  }
  return { exact, similar };
}

export function searchProducts(products: SupplierProduct[], query?: string) {
  if (!query?.trim()) return { products, approximate: false };
  const { exact, similar } = findProductMatches(products, query);
  return exact.length ? { products: exact, approximate: false } : { products: similar, approximate: similar.length > 0 };
}
