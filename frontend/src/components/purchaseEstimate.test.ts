import { describe, expect, it } from 'vitest';
import { estimatePurchase, parsePurchaseQuantity, unmetMinimum } from './purchaseEstimate';

const offer = (pack: string | null, amount: number, unit: string | null) => ({
  pack, price: { kind: 'published' as const, amount, unit },
});

describe('purchase quantity estimates', () => {
  it('rounds up to whole packs and applies the original price unit', () => {
    const quantity = parsePurchaseQuantity('20', 'kg')!;
    expect(estimatePurchase(offer('Мешок 25 кг', 485, 'кг'), quantity)).toEqual({
      packs: 1, purchased: { amount: 25, unit: 'kg' }, surplus: true, cost: 12125,
    });
    expect(estimatePurchase(offer('5 кг', 3225, 'уп.'), quantity)).toEqual({
      packs: 4, purchased: quantity, surplus: false, cost: 12900,
    });
    expect(estimatePurchase(offer('Упаковка: 1 200 шт.', 2, 'шт.'), parsePurchaseQuantity('1250', 'pcs')!))
      .toMatchObject({ packs: 2, purchased: { amount: 2400, unit: 'pcs' }, surplus: true, cost: 4800 });
  });

  it('handles decimal quantities and explicit metric pack sizes', () => {
    expect(estimatePurchase(offer('100 г', 50, 'уп.'), parsePurchaseQuantity('0,3', 'kg')!))
      .toMatchObject({ packs: 3, purchased: { amount: 0.3, unit: 'kg' }, surplus: false, cost: 150 });
    expect(estimatePurchase(offer('Бутылка 500 мл', 430, 'л'), parsePurchaseQuantity('1.1', 'l')!))
      .toMatchObject({ packs: 3, purchased: { amount: 1.5, unit: 'l' }, surplus: true, cost: 645 });
  });

  it('does not guess prices, pack sizes or selling units', () => {
    const quantity = parsePurchaseQuantity('20', 'kg')!;
    for (const pack of [null, '~1,4 кг', '10/15 кг коробка', 'от 5 кг', '10–25 кг', '500 мл']) {
      expect(estimatePurchase(offer(pack, 485, 'кг'), quantity)).toBeUndefined();
    }
    expect(estimatePurchase(offer('25 кг', 485, null), quantity)).toBeUndefined();
    expect(estimatePurchase(offer('25 кг', 485, 'рул.'), quantity)).toBeUndefined();
    expect(estimatePurchase({ pack: '25 кг', price: { kind: 'on_request' } }, quantity)).toBeUndefined();
    for (const value of ['', '0', '-1', '1e3', '1 000', '1000001', '0,0001']) {
      expect(parsePurchaseQuantity(value, 'kg')).toBeUndefined();
    }
    expect(parsePurchaseQuantity('2,5', 'pcs')).toBeUndefined();
  });

  it('flags a known applicable minimum without converting between unrelated units', () => {
    const quantity = parsePurchaseQuantity('20', 'kg')!;
    const estimate = estimatePurchase(offer('Пакет 1 кг', 525, 'кг'), quantity)!;
    expect(unmetMinimum({ amount: 25, unit: 'KG', label: '' }, estimate)).toBe('25 кг');
    expect(unmetMinimum({ amount: 25, unit: 'PCS', label: '' }, estimate)).toBeUndefined();
    expect(unmetMinimum({ amount: 10500, unit: 'RUB', label: '' }, estimate)).toBeUndefined();
    expect(unmetMinimum({ amount: 11000, unit: 'RUB', label: '' }, estimate)).toMatch(/^11\s000 ₽$/u);
  });
});
