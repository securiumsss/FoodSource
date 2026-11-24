import type { SupplierProduct, SupplierWithEvaluation } from '@food-suppliers/shared';

export const purchaseUnitOptions = [
  { value: 'kg', label: 'кг' },
  { value: 'l', label: 'л' },
  { value: 'pcs', label: 'шт.' },
] as const;

export type PurchaseUnit = (typeof purchaseUnitOptions)[number]['value'];
export type PurchaseQuantity = { amount: number; unit: PurchaseUnit };

const unitLabels = { kg: 'кг', l: 'л', pcs: 'шт.' };
const scale = { kg: 1000, l: 1000, pcs: 1 };
const number = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
const priceNumber = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const maxQuantity = 1_000_000;

export function parsePurchaseQuantity(value: string, unit: PurchaseUnit): PurchaseQuantity | undefined {
  const input = value.trim();
  if (!/^\d+(?:[.,]\d{1,3})?$/u.test(input)) return;
  const amount = Number(input.replace(',', '.'));
  if (amount <= 0 || amount > maxQuantity || (unit === 'pcs' && !Number.isInteger(amount))) return;
  return { amount, unit };
}

export function formatPurchaseQuantity({ amount, unit }: PurchaseQuantity) {
  return `${number.format(amount)} ${unitLabels[unit]}`;
}

export function formatEstimateCost(amount: number) {
  return `${priceNumber.format(amount)} ₽`;
}

function readPack(pack: string | null): PurchaseQuantity | undefined {
  // Only a single explicit pack size is usable for rounding an order up to whole packs.
  const match = pack?.trim().match(/^(?:(?:мешок|пакет|упаковка|пачка|короб(?:ка)?|банка|бутылка|монолит)\s*:?\s*)?(\d+(?:[ \u00a0\u202f]\d{3})*(?:[.,]\d{1,3})?)\s*(кг|гр?\.?|л|мл|шт\.?)$/iu);
  if (!match) return;
  const amount = Number(match[1].replace(/\s/gu, '').replace(',', '.'));
  const packUnit = match[2].toLocaleLowerCase('ru').replace(/\.$/u, '');
  if (packUnit === 'г' || packUnit === 'гр') return parsePurchaseQuantity(String(amount / 1000), 'kg');
  if (packUnit === 'мл') return parsePurchaseQuantity(String(amount / 1000), 'l');
  return parsePurchaseQuantity(String(amount), packUnit === 'кг' ? 'kg' : packUnit === 'л' ? 'l' : 'pcs');
}

export function estimatePurchase(product: Pick<SupplierProduct, 'pack' | 'price'>, quantity: PurchaseQuantity) {
  const { price } = product;
  if (price.kind !== 'published' || !Number.isFinite(price.amount) || price.amount <= 0) return;
  const pack = readPack(product.pack);
  if (!pack || pack.unit !== quantity.unit) return;

  const priceUnit = price.unit?.trim().toLocaleLowerCase('ru').replace(/\.$/u, '');
  const ratePerOrderUnit = priceUnit === unitLabels[pack.unit].replace(/\.$/u, '');
  const ratePerPack = priceUnit === 'уп' || (priceUnit === 'шт' && pack.unit !== 'pcs');
  if (!ratePerOrderUnit && !ratePerPack) return;

  // Use whole grams, millilitres or pieces so 0.3 / 0.1 does not overcount a pack.
  const factor = scale[pack.unit];
  const packSize = Math.round(pack.amount * factor);
  const requested = Math.round(quantity.amount * factor);
  const packs = Math.ceil(requested / packSize);
  const totalSize = packSize * packs;
  const amount = totalSize / factor;
  const cost = price.amount * (ratePerPack ? packs : amount);
  if (!Number.isFinite(cost)) return;
  return { packs, purchased: { amount, unit: pack.unit }, surplus: totalSize > requested, cost };
}

export function unmetMinimum(moq: SupplierWithEvaluation['moq'], estimate: NonNullable<ReturnType<typeof estimatePurchase>>) {
  const { amount, unit } = moq;
  if (amount === null) return;
  if (unit === 'RUB' && estimate.cost < amount) return formatEstimateCost(amount);
  if (((unit === 'KG' && estimate.purchased.unit === 'kg') || (unit === 'PCS' && estimate.purchased.unit === 'pcs'))
    && estimate.purchased.amount < amount) return formatPurchaseQuantity({ amount, unit: estimate.purchased.unit });
}
