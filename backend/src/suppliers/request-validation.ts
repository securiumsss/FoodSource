import { BadRequestException } from '@nestjs/common';
import type { CompareRequestDto, SupplierCategory, SupplierStatus, SuppliersQueryParams, WorkspaceUpdateDto } from '@food-suppliers/shared';
import { STATUSES } from './suppliers.service';

const categories: SupplierCategory[] = ['packaging', 'spices', 'dairy', 'frozen'];
const sorts = ['score', 'moq_asc', 'name_asc', 'updated'] as const;
const booleanKeys = ['hasCompliance', 'hasPriceEstimate', 'temperatureControlled', 'hasOwnDelivery', 'includeUnknownMoq'] as const;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException(`${label} must be an object`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new BadRequestException(`Unknown field: ${key}`);
}
function text(value: unknown, key: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${key} must be a non-empty string`);
  return value.trim();
}
function number(value: unknown, key: string, query: boolean): number {
  if (query && (typeof value !== 'string' || !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value))) throw new BadRequestException(`${key} must be a non-negative number`);
  if (!query && typeof value !== 'number') throw new BadRequestException(`${key} must be a non-negative number`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new BadRequestException(`${key} must be a non-negative number`);
  return parsed;
}
function boolean(value: unknown, key: string): boolean {
  if (value !== 'true' && value !== 'false') throw new BadRequestException(`${key} must be true or false`);
  return value === 'true';
}

export function parseQuery(value: unknown, contextOnly = false): SuppliersQueryParams {
  const input = object(value, 'Query');
  const contextKeys = ['region', 'maxMoqRub'];
  keys(input, contextOnly ? contextKeys : [...contextKeys, 'search', 'category', ...booleanKeys, 'status', 'sortBy']);
  const result: SuppliersQueryParams = {};
  if (input.region !== undefined) result.region = text(input.region, 'region');
  if (input.maxMoqRub !== undefined) result.maxMoqRub = number(input.maxMoqRub, 'maxMoqRub', true);
  if (input.search !== undefined) {
    if (typeof input.search !== 'string') throw new BadRequestException('search must be a string');
    result.search = input.search.trim();
  }
  if (input.category !== undefined) {
    if (!categories.includes(input.category as SupplierCategory)) throw new BadRequestException('Invalid category');
    result.category = input.category as SupplierCategory;
  }
  for (const key of booleanKeys) if (input[key] !== undefined) result[key] = boolean(input[key], key);
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status as SupplierStatus)) throw new BadRequestException('Invalid status');
    result.status = input.status as SupplierStatus;
  }
  if (input.sortBy !== undefined) {
    if (!sorts.includes(input.sortBy as typeof sorts[number])) throw new BadRequestException('Invalid sortBy');
    result.sortBy = input.sortBy as typeof sorts[number];
  }
  return result;
}

export function parseCompare(value: unknown): CompareRequestDto {
  const input = object(value, 'Body');
  keys(input, ['ids', 'region', 'maxMoqRub', 'search']);
  if (!Array.isArray(input.ids) || input.ids.some(id => typeof id !== 'string' || !id.trim() || id !== id.trim())) throw new BadRequestException('ids must be an array of non-empty IDs');
  const result: CompareRequestDto = { ids: input.ids as string[] };
  if (input.search !== undefined) result.search = text(input.search, 'search');
  if (input.region !== undefined) result.region = text(input.region, 'region');
  if (input.maxMoqRub !== undefined) result.maxMoqRub = number(input.maxMoqRub, 'maxMoqRub', false);
  return result;
}

export function parseWorkspaceUpdate(value: unknown): WorkspaceUpdateDto {
  const input = object(value, 'Body');
  keys(input, ['status', 'notes']);
  if (input.status === undefined && input.notes === undefined) throw new BadRequestException('Provide status or notes');
  const result: WorkspaceUpdateDto = {};
  if (input.status !== undefined) {
    if (!STATUSES.includes(input.status as SupplierStatus)) throw new BadRequestException('Invalid status');
    result.status = input.status as SupplierStatus;
  }
  if (input.notes !== undefined) {
    if (typeof input.notes !== 'string' || input.notes.length > 2000) throw new BadRequestException('notes must be a string of at most 2000 characters');
    result.notes = input.notes;
  }
  return result;
}
