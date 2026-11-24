import type { SupplierAssortment } from '@food-suppliers/shared';
import snapshot from './assortment.snapshot.json';

const catalogs = new Map(Object.entries(snapshot as Record<string, SupplierAssortment>));
export const getAssortment = (supplierId: string) => catalogs.get(supplierId);
