import type { Supplier, SupplierCategory, SupplierStatus } from './supplier.types';

export interface HealthResponse {
  status: 'ok';
  suppliersCount: number;
}

export type SupplierListItem = Pick<
  Supplier,
  'id' | 'name' | 'category' | 'categoryLabel' | 'city' | 'regions'
>;

export interface SuppliersQueryParams {
  search?: string;
  category?: SupplierCategory;
  region?: string;
  hasCompliance?: boolean;
  hasPriceEstimate?: boolean;
  temperatureControlled?: boolean;
  hasOwnDelivery?: boolean;
  maxMoqRub?: number;
  includeUnknownMoq?: boolean;
  status?: SupplierStatus;
  sortBy?: 'score' | 'moq_asc' | 'name_asc' | 'updated';
}

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

export interface SupplierScoring {
  total: number;
  verdict: 'recommended' | 'consider' | 'clarify';
  verdictLabel: string;
  breakdown: ScoreBreakdownItem[];
  highlights: string[];
  clarifications: string[];
}

export interface SupplierWorkspaceState {
  status: SupplierStatus;
  notes: string;
  updatedAt: string | null;
}

export interface SupplierProduct {
  id: string;
  name: string;
  pack: string | null;
  price: { kind: 'published'; amount: number; unit: string | null } | { kind: 'on_request' | 'not_published' };
  priceNote?: string;
  availabilityNote?: string;
  sourceUrl: string;
  checkedAt: string;
}

export interface SupplierAssortment {
  catalogUrl: string;
  groups: string[];
  products: SupplierProduct[];
}

export type SupplierWithEvaluation = Supplier & {
  workspace: SupplierWorkspaceState;
  scoring: SupplierScoring;
  matchedProducts?: Pick<SupplierProduct, 'id' | 'name' | 'pack'>[];
};

export interface RfqTemplate {
  subject: string;
  body: string;
  checklist: string[];
}

export interface SuppliersListResponse {
  items: SupplierWithEvaluation[];
  total: number;
  facets: {
    categories: Array<{ value: SupplierCategory; label: string; count: number }>;
    regions: string[];
    statuses: SupplierStatus[];
    statusCounts: Record<SupplierStatus, number>;
  };
}

export type SupplierDetailResponse = SupplierWithEvaluation & { rfqTemplate: RfqTemplate; assortment?: SupplierAssortment };

export interface CompareRequestDto {
  ids: string[];
  search?: string;
  region?: string;
  maxMoqRub?: number;
}

export interface ComparisonRow {
  key: string;
  label: string;
  values: Record<string, string>;
  bestSupplierIds: string[];
}

export interface CompareResponse {
  suppliers: SupplierWithEvaluation[];
  winnerId: string | null;
  winnerReason: string;
  rows: ComparisonRow[];
}

export interface WorkspaceUpdateDto {
  status?: SupplierStatus;
  notes?: string;
}
