/** Stable category identifiers used by both the API and the UI. */
export type SupplierCategory = 'packaging' | 'spices' | 'dairy' | 'frozen';

export function requiresTemperatureControl(category: SupplierCategory): boolean {
  return category === 'dairy' || category === 'frozen';
}

/** City-only coverage is intentionally distinct from coverage of the surrounding region. */
export type SupplierRegion =
  | 'Москва'
  | 'Москва и МО'
  | 'Санкт-Петербург'
  | 'Санкт-Петербург и ЛО'
  | 'Вся РФ'
  | 'Отдельные регионы РФ';

/** Combined coverage includes the city, but a city alone does not cover its surrounding region. */
export function getDeliveryCoverage(regions: readonly SupplierRegion[], requested: string): 'local' | 'federal' | null {
  if (regions.some(region => region === requested
    || (region === 'Москва и МО' && requested === 'Москва')
    || (region === 'Санкт-Петербург и ЛО' && requested === 'Санкт-Петербург'))) return 'local';
  return regions.includes('Вся РФ') ? 'federal' : null;
}

export type MoqUnit = 'RUB' | 'KG' | 'PCS' | 'BOX';

export type SupplierStatus = 'new' | 'shortlist' | 'contacted' | 'rejected';

export interface DeliveryTerms {
  hasOwnDelivery: boolean | null;
  temperatureControlled: boolean | null;
  leadTime: string | null;
  terms: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: SupplierCategory;
  categoryLabel: string;
  description: string;
  /** For a multi-warehouse supplier this may identify a known dispatch city. */
  city: string;
  regions: SupplierRegion[];
  website: string | null;
  sourceUrl: string;
  /** Evidence pages, including sourceUrl. A document may apply only to one product. */
  sourceUrls: string[];
  contacts: {
    phone: string | null;
    email: string | null;
    telegramOrWhatsapp: string | null;
  };
  moq: { amount: number | null; unit: MoqUnit | null; label: string };
  /** Price of the specific example in label, not a comparable category-wide price. */
  priceEstimate: { min: number | null; max: number | null; unit: string | null; label: string };
  /** Context and limitations for prices, MOQ and documentation. */
  pricingNote: string | null;
  documents: string[];
  complianceSystems: string[];
  delivery: DeliveryTerms;
  pros: string[];
  cons: string[];
  defaultStatus: SupplierStatus;
  defaultNotes: '';
  collectedAt: string;
}
