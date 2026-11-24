import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Supplier } from '@food-suppliers/shared';
import { ScoringService } from '../scoring/scoring.service';
import { projectRoot } from '../storage/database';
import { StorageService, type StoredSupplier } from '../storage/storage.service';
import { parseCompare, parseQuery, parseWorkspaceUpdate } from './request-validation';
import { SuppliersService } from './suppliers.service';

const seed = JSON.parse(readFileSync(resolve(projectRoot, 'data/suppliers.seed.json'), 'utf8')) as Supplier[];
function fixture(id: string, changes: Partial<Supplier> = {}): StoredSupplier {
  return {
    supplier: {
      ...structuredClone(seed[0]), id, name: `Поставщик ${id}`, category: 'frozen', categoryLabel: 'Заморозка',
      regions: ['Санкт-Петербург и ЛО'], documents: ['Декларация'], complianceSystems: ['ЭДО'],
      contacts: { phone: '+7 812 555 12 34', email: 'food@test.test', telegramOrWhatsapp: null },
      moq: { amount: 3000, unit: 'RUB', label: '3 000 ₽' },
      priceEstimate: { min: 5, max: 5, unit: 'RUB/кг', label: '5 ₽/кг' }, pricingNote: null,
      delivery: { hasOwnDelivery: true, temperatureControlled: true, leadTime: '1 день', terms: 'Курьером' },
      ...changes,
    },
    workspace: { status: 'new', notes: '', updatedAt: null },
  };
}
const rows: StoredSupplier[] = [
  fixture('a'),
  fixture('b', { regions: ['Вся РФ'], documents: [], complianceSystems: ['ХАССП'], moq: { amount: 12000, unit: 'RUB', label: '12 000 ₽' }, delivery: { hasOwnDelivery: false, temperatureControlled: null, leadTime: null, terms: 'По запросу' } }),
  fixture('c', { regions: ['Вся РФ'], documents: [], complianceSystems: [], moq: { amount: 25, unit: 'KG', label: '25 кг' } }),
  fixture('d', { category: 'spices', regions: ['Москва и МО'] }),
  fixture('e', { regions: ['Санкт-Петербург и ЛО'], documents: [], complianceSystems: [], moq: { amount: null, unit: null, label: 'По запросу' } }),
];
rows[3].workspace.status = 'contacted';
rows[2].workspace.notes = 'Связаться с ОЛЬГОЙ насчёт ягод';
const storage = {
  listWithWorkspace: () => rows,
  findWithWorkspace: (id: string) => rows.find(row => row.supplier.id === id),
} as unknown as StorageService;
const service = new SuppliersService(storage, new ScoringService());
const ids = (items: { id: string }[]) => items.map(item => item.id).sort();

describe('SuppliersService', () => {
  it('filters by category and region, including federal suppliers, and reports global facets', async () => {
    const result = (await service.findAll({ category: 'frozen', region: 'Санкт-Петербург и ЛО' }));
    expect(ids(result.items)).toEqual(['a', 'b', 'c', 'e']);
    expect(result.total).toBe(4);
    expect(result.facets.categories.find(x => x.value === 'spices')?.count).toBe(1);
    expect(result.facets.categories.find(x => x.value === 'frozen')?.count).toBe(4);
    expect(result.facets.statusCounts).toEqual({ new: 4, shortlist: 0, contacted: 1, rejected: 0 });
    expect((await service.findAll({ category: 'frozen', status: 'contacted' }))).toMatchObject({ total: 0, facets: { statusCounts: { contacted: 1 } } });
  });

  it('filters compliance and monetary MOQ without discarding unknown or non-RUB MOQ by default', async () => {
    expect(ids((await service.findAll({ category: 'frozen', hasCompliance: true })).items)).toEqual(['a', 'b']);
    expect(ids((await service.findAll({ category: 'frozen', maxMoqRub: 5000 })).items)).toEqual(['a', 'c', 'e']);
    expect(ids((await service.findAll({ category: 'frozen', maxMoqRub: 5000, includeUnknownMoq: false })).items)).toEqual(['a']);
    expect((await service.findAll({ category: 'frozen', sortBy: 'moq_asc' })).items.map(s => s.id).slice(0, 2)).toEqual(['a', 'b']);
  });

  it('searches Cyrillic case-insensitively in notes and filters booleans precisely', async () => {
    expect(ids((await service.findAll({ search: 'ольгой' })).items)).toEqual(['c']);
    expect(ids((await service.findAll({ category: 'frozen', hasOwnDelivery: false })).items)).toEqual(['b']);
    expect((await service.findAll({ category: 'frozen', search: 'морозка' })).items.length).toBe(4);
    expect(ids((await service.findAll({ temperatureControlled: true })).items)).toEqual(['a', 'c', 'e']);
  });

  it('finds products in visible price labels and includes combined coverage for a city only', async () => {
    const localRows = [
      fixture('area', { regions: ['Москва и МО'], priceEstimate: { min: 365, max: 365, unit: 'RUB', label: 'Креветки — 365 ₽' } }),
      fixture('city', { regions: ['Москва'] }),
      fixture('federal', { regions: ['Вся РФ'] }),
    ];
    const store = { listWithWorkspace: () => localRows } as unknown as StorageService;
    const catalog = new SuppliersService(store, new ScoringService());
    expect(ids((await catalog.findAll({ search: 'КРЕВЕТКИ', region: 'Москва' })).items)).toEqual(['area']);
    expect(ids((await catalog.findAll({ region: 'Москва' })).items)).toEqual(['area', 'city', 'federal']);
    expect(ids((await catalog.findAll({ region: 'Москва и МО' })).items)).toEqual(['area', 'federal']);
  });

  it('finds catalog positions with reordered words and keeps product prices distinct in comparison', async () => {
    const sample = ['sup-dairy-01', 'sup-dairy-03'].map(id => fixture(id, { category: 'dairy', regions: ['Москва и МО'] }));
    const store = {
      listWithWorkspace: () => sample,
      findWithWorkspace: (id: string) => sample.find(row => row.supplier.id === id),
    } as unknown as StorageService;
    const catalog = new SuppliersService(store, new ScoringService());
    const result = await catalog.findAll({ region: 'Москва и МО', search: '33 % СЛИВКИ 1 л' });
    expect(ids(result.items)).toEqual(['sup-dairy-01', 'sup-dairy-03']);
    expect(result.items.find(item => item.id === 'sup-dairy-01')?.matchedProducts).toEqual([
      { id: 'amanda-33-1l', name: 'Сливки ультрапастеризованные Amanda 33%', pack: '1 л' },
    ]);
    expect((await catalog.findAll({ search: 'сливки 133%' })).total).toBe(0);
    expect((await catalog.findOne('sup-dairy-01')).assortment?.products[0]).toMatchObject({ price: { amount: 430 }, availabilityNote: expect.stringContaining('нет в наличии') });
    const compared = await catalog.compare(parseCompare({ ids: ['sup-dairy-01', 'sup-dairy-03'], search: 'сливки 33%' }));
    const row = compared.rows.find(item => item.key === 'matchedProducts');
    expect(row?.values['sup-dairy-03']).toContain('Цена по запросу');
    expect(row?.values['sup-dairy-01']).toContain('нет в наличии');
    expect(row?.bestSupplierIds).toEqual([]);
  });

  it('compares scores, known RUB MOQ, documents and confirmed logistics', async () => {
    const result = await service.compare({ ids: ['b', 'a'], region: 'Санкт-Петербург и ЛО', maxMoqRub: 5000 });
    expect(result.winnerId).toBe('a');
    expect(result.rows.find(row => row.key === 'score')?.bestSupplierIds).toEqual(['a']);
    expect(result.rows.find(row => row.key === 'moq')?.bestSupplierIds).toEqual(['a']);
    expect(result.rows.find(row => row.key === 'documents')?.bestSupplierIds).toEqual(['a']);
    expect(result.rows.find(row => row.key === 'delivery')?.bestSupplierIds).toEqual(['a']);
    expect(result.rows.find(row => row.key === 'delivery')?.values.a).toContain('Своя доставка: да');
    expect(result.rows.find(row => row.key === 'delivery')?.values.b).toContain('Своя доставка: нет');
    expect(result.rows.find(row => row.key === 'temperature')?.bestSupplierIds).toEqual(['a']);
    expect(result.rows.map(row => row.key)).toEqual([
      'score', 'regions', 'moq', 'price', 'delivery', 'temperature', 'documents', 'complianceSystems', 'contacts', 'status', 'pricingNote',
    ]);
    expect((await service.compare({ ids: ['a', 'd'] })).rows.find(row => row.key === 'temperature')?.values.d).toBe('Не применяется');
    for (const bad of [['a'], ['a', 'b', 'c', 'd', 'e'], ['a', 'a'], ['a', 'missing']]) {
      await expect(service.compare({ ids: bad })).rejects.toThrow(BadRequestException);
    }
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('only marks the lowest MOQ when at least two suppliers publish a numerical RUB minimum', async () => {
    const bestMoq = async (ids: string[]) => (await service.compare({ ids })).rows.find(row => row.key === 'moq')?.bestSupplierIds;
    expect(await bestMoq(['a', 'c', 'e'])).toEqual([]);
    expect(await bestMoq(['c', 'e'])).toEqual([]);
    expect(await bestMoq(['a', 'b', 'c', 'e'])).toEqual(['a']);
    expect(await bestMoq(['b', 'd', 'a', 'c'])).toEqual(['d', 'a']);
  });

  it('preserves all tied leaders and reports the tie explicitly', async () => {
    const tieRows = [fixture('tie-a'), fixture('tie-b')];
    const tiedStorage = { findWithWorkspace: (id: string) => tieRows.find(row => row.supplier.id === id) } as unknown as StorageService;
    const result = await new SuppliersService(tiedStorage, new ScoringService()).compare({ ids: ['tie-b', 'tie-a'] });
    expect(result.winnerId).toBe('tie-b');
    expect(result.winnerReason).toMatch(/равн/i);
    expect(result.rows.find(row => row.key === 'score')?.bestSupplierIds).toEqual(['tie-b', 'tie-a']);
  });
});

describe('request validation', () => {
  it('parses booleans and numeric context, rejecting invalid, repeated or unknown values', () => {
    expect(parseQuery({ hasCompliance: 'false', maxMoqRub: '5000', includeUnknownMoq: 'true' })).toEqual({ hasCompliance: false, maxMoqRub: 5000, includeUnknownMoq: true });
    for (const query of [{ hasCompliance: '1' }, { maxMoqRub: '-1' }, { maxMoqRub: 'Infinity' }, { category: 'bad' }, { search: ['x', 'y'] }, { other: 'x' }]) {
      expect(() => parseQuery(query)).toThrow(BadRequestException);
    }
    expect(() => parseQuery({ status: 'new' }, true)).toThrow(BadRequestException);
    expect(() => parseCompare({ ids: ['a', 'b'], maxMoqRub: '5000' })).toThrow(BadRequestException);
    expect(() => parseWorkspaceUpdate({ status: 'other' })).toThrow(BadRequestException);
    expect(() => parseWorkspaceUpdate({ notes: 'x'.repeat(2001) })).toThrow(BadRequestException);
    expect(() => parseWorkspaceUpdate({ notes: null })).toThrow(BadRequestException);
  });
});

describe('workspace persistence', () => {
  it('persists status and notes in SQLite and finds them after reopening', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'food-suppliers-workspace-'));
    const oldPath = process.env.DATABASE_PATH;
    const oldUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    process.env.DATABASE_PATH = join(dir, 'workspace.db');
    let first: StorageService | undefined;
    let second: StorageService | undefined;
    try {
      first = new StorageService();
      const initial = new SuppliersService(first, new ScoringService());
      const id = seed[0].id;
      const updated = await initial.updateWorkspace(id, { status: 'contacted', notes: 'Связались с Ириной' });
      expect(updated.workspace).toMatchObject({ status: 'contacted', notes: 'Связались с Ириной' });
      expect(updated.workspace.updatedAt).toEqual(expect.any(String));
      await first.onModuleDestroy(); first = undefined;
      second = new StorageService();
      const reopened = new SuppliersService(second, new ScoringService());
      expect((await reopened.findOne(id)).workspace).toEqual(updated.workspace);
      expect(ids((await reopened.findAll({ status: 'contacted', search: 'ИРИНОЙ' })).items)).toEqual([id]);
      const notesOnly = await reopened.updateWorkspace(id, { notes: '' });
      expect(notesOnly.workspace).toMatchObject({ status: 'contacted', notes: '' });
      await expect(reopened.updateWorkspace('missing', { status: 'new' })).rejects.toThrow(NotFoundException);
    } finally {
      await first?.onModuleDestroy(); await second?.onModuleDestroy();
      if (oldUrl !== undefined) process.env.DATABASE_URL = oldUrl;
      if (oldPath === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = oldPath;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
