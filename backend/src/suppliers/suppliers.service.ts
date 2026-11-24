import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getDeliveryCoverage, requiresTemperatureControl } from '@food-suppliers/shared';
import type {
  CompareRequestDto, CompareResponse, ComparisonRow, SupplierCategory, SupplierDetailResponse,
  SupplierStatus, SuppliersListResponse, SuppliersQueryParams, SupplierWithEvaluation, WorkspaceUpdateDto,
} from '@food-suppliers/shared';
import { findProducts, getAssortment, productPrice } from './assortment';
import { ScoringService } from '../scoring/scoring.service';
import { StorageService, type StoredSupplier } from '../storage/storage.service';

export const STATUSES: SupplierStatus[] = ['new', 'shortlist', 'contacted', 'rejected'];
const categoryOrder: SupplierCategory[] = ['packaging', 'spices', 'dairy', 'frozen'];
const statusLabels: Record<SupplierStatus, string> = {
  new: 'Новый', shortlist: 'В коротком списке', contacted: 'Связались', rejected: 'Отклонён',
};
const compareNames = (a: SupplierWithEvaluation, b: SupplierWithEvaluation) =>
  a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id);
const rubMoq = (supplier: SupplierWithEvaluation) =>
  supplier.moq.unit === 'RUB' && supplier.moq.amount !== null ? supplier.moq.amount : null;

@Injectable()
export class SuppliersService {
  constructor(private readonly storage: StorageService, private readonly scoring: ScoringService) {}

  private evaluate(row: StoredSupplier, context: Pick<SuppliersQueryParams, 'region' | 'maxMoqRub'>): SupplierWithEvaluation {
    return { ...row.supplier, workspace: row.workspace, scoring: this.scoring.evaluate(row.supplier, context) };
  }

  async findAll(query: SuppliersQueryParams = {}): Promise<SuppliersListResponse> {
    const all = await this.storage.listWithWorkspace();
    const categories = categoryOrder.flatMap(value => {
      const matches = all.filter(row => row.supplier.category === value);
      return matches.length ? [{ value, label: matches[0].supplier.categoryLabel, count: matches.length }] : [];
    });
    const regions = [...new Set(all.flatMap(row => row.supplier.regions))].sort((a, b) => a.localeCompare(b, 'ru'));
    const statusCounts: Record<SupplierStatus, number> = { new: 0, shortlist: 0, contacted: 0, rejected: 0 };
    for (const { workspace } of all) statusCounts[workspace.status]++;
    const needle = query.search?.trim().toLocaleLowerCase('ru');

    const matchesBySupplier = new Map<string, NonNullable<SupplierWithEvaluation['matchedProducts']>>();
    const filtered = all.filter(({ supplier: s, workspace }) => {
      if (query.category !== undefined && s.category !== query.category) return false;
      if (query.region !== undefined && !getDeliveryCoverage(s.regions, query.region)) return false;
      if (query.hasCompliance !== undefined && (s.documents.length > 0 || s.complianceSystems.length > 0) !== query.hasCompliance) return false;
      if (query.hasPriceEstimate !== undefined && (s.priceEstimate.min !== null || s.priceEstimate.max !== null) !== query.hasPriceEstimate) return false;
      if (query.temperatureControlled !== undefined && (!requiresTemperatureControl(s.category) || s.delivery.temperatureControlled !== query.temperatureControlled)) return false;
      if (query.hasOwnDelivery !== undefined && s.delivery.hasOwnDelivery !== query.hasOwnDelivery) return false;
      if (query.status !== undefined && workspace.status !== query.status) return false;
      if (query.maxMoqRub !== undefined) {
        const knownRubMoq = s.moq.unit === 'RUB' && s.moq.amount !== null;
        if (knownRubMoq && s.moq.amount! > query.maxMoqRub) return false;
        if (!knownRubMoq && query.includeUnknownMoq === false) return false;
      }
      if (needle) {
        const haystack = [s.name, s.description, s.city, s.categoryLabel, s.priceEstimate.label, s.delivery.terms,
          ...s.documents, ...s.complianceSystems, ...s.pros, ...s.cons, ...(getAssortment(s.id)?.groups ?? []), workspace.notes]
          .join('\n').toLocaleLowerCase('ru');
        const matches = findProducts(s.id, needle);
        if (!matches.length && !haystack.includes(needle)) return false;
        if (matches.length) matchesBySupplier.set(s.id, matches.slice(0, 3).map(({ id, name, pack }) => ({ id, name, pack })));
      }
      return true;
    });

    const items = filtered.map(row => {
      const evaluated = this.evaluate(row, query);
      const matchedProducts = matchesBySupplier.get(evaluated.id);
      return matchedProducts ? { ...evaluated, matchedProducts } : evaluated;
    });
    items.sort((a, b) => {
      switch (query.sortBy ?? 'score') {
        case 'name_asc': return compareNames(a, b);
        case 'updated': {
          const aTime = a.workspace.updatedAt;
          const bTime = b.workspace.updatedAt;
          return (aTime === bTime ? 0 : aTime === null ? 1 : bTime === null ? -1 : bTime.localeCompare(aTime)) || compareNames(a, b);
        }
        case 'moq_asc': {
          const aMoq = rubMoq(a);
          const bMoq = rubMoq(b);
          return (aMoq === bMoq ? 0 : aMoq === null ? 1 : bMoq === null ? -1 : aMoq - bMoq) || compareNames(a, b);
        }
        case 'score': return b.scoring.total - a.scoring.total || compareNames(a, b);
      }
    });
    return { items, total: items.length, facets: { categories, regions, statuses: [...STATUSES], statusCounts } };
  }

  async findOne(id: string, context: Pick<SuppliersQueryParams, 'region' | 'maxMoqRub'> = {}): Promise<SupplierDetailResponse> {
    const row = await this.storage.findWithWorkspace(id);
    if (!row) throw new NotFoundException(`Supplier ${id} not found`);
    const evaluated = this.evaluate(row, context);
    return { ...evaluated, assortment: getAssortment(id), rfqTemplate: this.scoring.buildRfqTemplate(row.supplier, evaluated.scoring, context) };
  }

  async updateWorkspace(id: string, update: WorkspaceUpdateDto): Promise<SupplierDetailResponse> {
    if (update.status === undefined && update.notes === undefined) throw new BadRequestException('Provide status or notes');
    if (update.status !== undefined && !STATUSES.includes(update.status)) throw new BadRequestException('Invalid status');
    if (update.notes !== undefined && (typeof update.notes !== 'string' || update.notes.length > 2000)) throw new BadRequestException('Invalid notes');
    const row = await this.storage.updateWorkspace(id, update);
    if (!row) throw new NotFoundException(`Supplier ${id} not found`);
    const evaluated = this.evaluate(row, {});
    return { ...evaluated, assortment: getAssortment(id), rfqTemplate: this.scoring.buildRfqTemplate(row.supplier, evaluated.scoring) };
  }

  async compare(request: CompareRequestDto): Promise<CompareResponse> {
    const ids = request?.ids;
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 4 || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
      throw new BadRequestException('Provide 2–4 unique supplier IDs');
    }
    const suppliers = await Promise.all(ids.map(async id => {
      const row = await this.storage.findWithWorkspace(id);
      if (!row) throw new BadRequestException(`Supplier ${id} not found`);
      return this.evaluate(row, request);
    }));
    const maxScore = Math.max(...suppliers.map(supplier => supplier.scoring.total));
    const winners = suppliers.filter(supplier => supplier.scoring.total === maxScore);
    const winner = winners[0];
    const winnerReason = winners.length > 1
      ? 'При равном скоринге показан первый поставщик из лидеров.'
      : 'Самый высокий скоринг по выбранным условиям.';

    const makeRow = (key: string, label: string, format: (supplier: SupplierWithEvaluation) => string, best: string[] = []): ComparisonRow => ({
      key, label, values: Object.fromEntries(suppliers.map(supplier => [supplier.id, format(supplier)])), bestSupplierIds: best,
    });
    const bestPositiveCount = (value: (supplier: SupplierWithEvaluation) => number): string[] => {
      return suppliers.filter(supplier => value(supplier) > 0).map(supplier => supplier.id);
    };
    const knownMoq = suppliers.map(rubMoq).filter((value): value is number => value !== null);
    const minMoq = knownMoq.length >= 2 ? Math.min(...knownMoq) : null;
    const productsBySupplier = new Map(suppliers.map(s => [s.id, findProducts(s.id, request.search)]));
    const rows: ComparisonRow[] = [
      makeRow('score', 'Итоговый скоринг', s => `${s.scoring.total} / 100`, winners.map(s => s.id)),
      makeRow('regions', 'Регионы доставки', s => s.regions.join(', ') || 'Не указаны'),
      makeRow('moq', 'Минимальный заказ (MOQ)', s => s.moq.label, minMoq === null ? [] : suppliers.filter(s => rubMoq(s) === minMoq).map(s => s.id)),
      ...([...productsBySupplier.values()].some(items => items.length) ? [
        makeRow('matchedProducts', 'Позиции по запросу', s => productsBySupplier.get(s.id)?.slice(0, 3).map(product =>
          [product.name, product.pack, productPrice(product), product.availabilityNote].filter(Boolean).join(' · '),
        ).join('\n') || 'Нет совпадений в собранных позициях'),
      ] : []),
      makeRow('price', 'Пример цены', s => s.priceEstimate.label),
      makeRow('delivery', 'Доставка и сроки', s => [`Своя доставка: ${s.delivery.hasOwnDelivery === true ? 'да' : s.delivery.hasOwnDelivery === false ? 'нет' : 'не указано'}.`, s.delivery.terms, s.delivery.leadTime ? `Срок: ${s.delivery.leadTime}` : 'Срок не указан'].join(' '), suppliers.filter(s => s.delivery.hasOwnDelivery === true).map(s => s.id)),
      ...(suppliers.some(s => requiresTemperatureControl(s.category)) ? [
        makeRow('temperature', 'Температурный режим', s => !requiresTemperatureControl(s.category) ? 'Не применяется' : s.delivery.temperatureControlled === true ? 'Подтверждён' : s.delivery.temperatureControlled === false ? 'Не предусмотрен' : 'Не подтверждён', suppliers.filter(s => requiresTemperatureControl(s.category) && s.delivery.temperatureControlled === true).map(s => s.id)),
      ] : []),
      makeRow('documents', 'Документы', s => s.documents.join(', ') || 'Не указаны', bestPositiveCount(s => s.documents.length)),
      makeRow('complianceSystems', 'Системы прослеживаемости', s => s.complianceSystems.join(', ') || 'Не указаны', bestPositiveCount(s => s.complianceSystems.length)),
      makeRow('contacts', 'Контакты', s => [s.contacts.phone, s.contacts.email, s.contacts.telegramOrWhatsapp].filter(Boolean).join(', ') || 'Не указаны'),
      makeRow('status', 'Статус работы', s => statusLabels[s.workspace.status]),
      makeRow('pricingNote', 'Примечание к условиям', s => s.pricingNote?.trim() || 'Не указано'),
    ];
    return { suppliers, winnerId: winner.id, winnerReason, rows };
  }
}
