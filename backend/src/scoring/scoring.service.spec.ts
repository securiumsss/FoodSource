import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Supplier } from '@food-suppliers/shared';
import { projectRoot } from '../storage/database';
import { ScoringService } from './scoring.service';

const seed = JSON.parse(readFileSync(resolve(projectRoot, 'data/suppliers.seed.json'), 'utf8')) as Supplier[];
function supplier(): Supplier {
  return {
    ...structuredClone(seed[0]),
    category: 'frozen', categoryLabel: 'Замороженные продукты оптом',
    regions: ['Москва и МО'], documents: ['Декларация'], complianceSystems: ['ЭДО'],
    contacts: { phone: '+7 812 555 12 34', email: 'test@food.test', telegramOrWhatsapp: null },
    moq: { amount: 5000, unit: 'RUB', label: 'от 5 000 ₽' },
    priceEstimate: { min: 100, max: 100, unit: 'RUB/кг', label: '100 ₽/кг' },
    pricingNote: null,
    delivery: { hasOwnDelivery: true, temperatureControlled: true, leadTime: '1 день', terms: 'Доставка' },
  };
}

describe('ScoringService', () => {
  const scoring = new ScoringService();
  const regionScore = (s: Supplier, region?: string) => scoring.evaluate(s, { region }).breakdown.find(item => item.key === 'region')!.score;

  it('scores exact, federal, missing and unfiltered regions according to the rubric', () => {
    const s = supplier();
    expect(regionScore(s, 'Москва и МО')).toBe(30);
    expect(regionScore({ ...s, regions: ['Вся РФ'] }, 'Москва и МО')).toBe(22);
    expect(regionScore(s, 'Санкт-Петербург и ЛО')).toBe(0);
    expect(regionScore(s)).toBe(22);
    expect(regionScore({ ...s, regions: ['Вся РФ'] })).toBe(30);
    expect(regionScore({ ...s, regions: ['Москва', 'Санкт-Петербург'], delivery: { ...s.delivery, leadTime: null } })).toBe(22);
    expect(regionScore({ ...s, regions: [], delivery: { ...s.delivery, leadTime: null } })).toBe(0);
    expect(scoring.evaluate(s, { region: 'Москва и МО', maxMoqRub: 5000 }).total).toBe(100);
  });

  it('uses the same directional delivery coverage for scoring and RFQ', () => {
    const cities = [['Москва', 'Москва и МО'], ['Санкт-Петербург', 'Санкт-Петербург и ЛО']] as const;
    for (const [city, area] of cities) {
      const covered = { ...supplier(), regions: [area] };
      const cityOnly = { ...supplier(), regions: [city] };
      expect(regionScore(covered, city)).toBe(30);
      expect(regionScore(cityOnly, area)).toBe(0);
      const rfq = (s: Supplier, region: string) => scoring.buildRfqTemplate(s, scoring.evaluate(s, { region }), { region });
      expect(rfq(covered, city).body).not.toContain('Можете ли вы доставить');
      expect(rfq(cityOnly, area).body).toContain('Можете ли вы доставить');
    }
  });

  it('describes missing delivery time only in the logistics criterion', () => {
    const s = supplier();
    s.delivery.leadTime = null;
    const result = scoring.evaluate(s);
    expect(result.breakdown.find(item => item.key === 'region')?.detail).toBe('Покрытие: Москва и МО.');
    expect(result.breakdown.find(item => item.key === 'logistics')?.detail).toContain('; срок доставки не указан.');
    s.delivery.leadTime = '1 день';
    expect(scoring.evaluate(s).breakdown.find(item => item.key === 'region')?.detail).toContain('срок доставки указан');
  });

  it('uses the stated scoring thresholds', () => {
    const s = supplier();
    expect(scoring.evaluate(s, { region: 'Москва и МО', maxMoqRub: 5000 })).toMatchObject({ total: 100, verdict: 'recommended' });
    expect(scoring.evaluate(s, { region: 'Санкт-Петербург и ЛО', maxMoqRub: 5000 })).toMatchObject({ total: 70, verdict: 'consider' });
    expect(scoring.evaluate({ ...s, documents: [], complianceSystems: [], moq: { amount: null, unit: null, label: 'По запросу' }, priceEstimate: { min: null, max: null, unit: null, label: 'По запросу' } }, { region: 'Санкт-Петербург и ЛО' }).verdict).toBe('clarify');
  });

  it.each(['packaging', 'spices'] as const)('ignores cold-chain data for %s and can still score 20 in logistics', category => {
    const s = { ...supplier(), category };
    for (const temperatureControlled of [true, false, null]) {
      s.delivery.temperatureControlled = temperatureControlled;
      const result = scoring.evaluate(s, { region: 'Москва и МО', maxMoqRub: 5000 });
      expect(result.total).toBe(100);
      expect(scoring.evaluate(s).breakdown.find(item => item.key === 'logistics')?.score).toBe(20);
      expect(result.breakdown.find(item => item.key === 'logistics')?.detail).toContain('условия доставки опубликованы');
      expect(JSON.stringify([result, scoring.buildRfqTemplate(s, result)])).not.toMatch(/температур|рефрижератор|\+0/iu);
    }
    s.delivery.terms = 'По запросу';
    s.delivery.leadTime = null;
    expect(scoring.evaluate(s, { maxMoqRub: 4000 }).breakdown.find(item => item.key === 'logistics')?.score).toBe(7);
  });

  it('includes gaps and does not pretend unknown MOQ matches the budget', () => {
    const s = supplier();
    s.moq = { amount: null, unit: null, label: 'По запросу' };
    s.priceEstimate = { min: null, max: null, unit: null, label: 'По запросу' };
    s.documents = [];
    s.complianceSystems = [];
    s.pricingNote = 'Порог на сайте противоречив; цену нужно подтвердить.';
    s.delivery.temperatureControlled = null;
    const result = scoring.evaluate(s, { region: 'Москва и МО', maxMoqRub: 1000 });
    expect(result.breakdown.find(item => item.key === 'transparency')?.score).toBe(7);
    expect(result.breakdown.find(item => item.key === 'logistics')?.score).toBe(9);
    expect(result.clarifications.join(' ')).toContain('Уточнить актуальные цены и минимальный заказ для вашего региона');
    expect(result.breakdown.find(item => item.key === 'transparency')?.detail).toBe('Есть телефон и email; минимальный заказ и цена по запросу.');
    expect(result.breakdown.map(item => item.detail).join(' ')).not.toContain('+0');
    expect(result.clarifications.join(' ')).toMatch(/минимальн|прайс|деклараци|рефрижератор/i);
    expect(result.highlights.join(' ')).not.toMatch(/Специализация:|Указан город:/u);
    expect(result.highlights.length).toBeLessThanOrEqual(4);
    expect(result.breakdown.reduce((sum, item) => sum + item.maxScore, 0)).toBe(100);
  });

  it('creates a polite RFQ with questions corresponding to actual missing fields', () => {
    const s = supplier();
    s.moq = { amount: null, unit: null, label: 'По запросу' };
    s.priceEstimate = { min: null, max: null, unit: null, label: 'По запросу' };
    s.documents = [];
    s.complianceSystems = ['ЭДО'];
    s.pricingNote = 'Цена зависит от фасовки.';
    s.delivery.temperatureControlled = false;
    const rfq = scoring.buildRfqTemplate(s, scoring.evaluate(s));
    expect(rfq.subject).toContain(s.name);
    expect(rfq.body).toContain(s.categoryLabel);
    expect(rfq.body).toContain('Здравствуйте');
    expect(rfq.body).toContain('Можете направить нам актуальный оптовый прайс-лист');
    expect(rfq.body).toContain('Каковы минимальный объём или сумма заказа и условия отгрузки?');
    expect(rfq.body).toContain('Можете подтвердить наличие деклараций');
    expect(rfq.body).toContain('Какой температурный режим вы поддерживаете');
    expect(rfq.body).not.toContain(s.pricingNote);
    expect(rfq.body).not.toMatch(/• (Запросить|Уточнить|Проверить)/u);
    expect(rfq.checklist.filter(item => /минимальн/iu.test(item))).toHaveLength(1);
    for (const term of ['минимальн', 'прайс', 'декларац', 'рефрижератор', 'актуальные цены']) {
      expect(rfq.checklist.join(' ').toLowerCase()).toContain(term);
    }
  });

  it('merges overlapping MOQ checks while keeping ruble and budget details', () => {
    const s = supplier();
    s.pricingNote = 'Условия зависят от партии.';
    const context = { maxMoqRub: 1000 };
    const rfq = () => scoring.buildRfqTemplate(s, scoring.evaluate(s, context), context);

    expect(rfq().checklist.filter(item => /минимальн|в пределах/iu.test(item))).toEqual([
      expect.stringMatching(/минимальный заказ.*в пределах 1000 ₽/u),
    ]);
    s.moq = { amount: null, unit: null, label: 'По запросу' };
    expect(rfq().checklist.filter(item => /минимальн/iu.test(item))).toEqual([
      expect.stringMatching(/минимальную сумму заказа в рублях/u),
    ]);
  });
});
