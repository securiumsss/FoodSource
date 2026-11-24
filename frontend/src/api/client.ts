import type {
  CompareRequestDto, CompareResponse, HealthResponse, SupplierDetailResponse,
  SuppliersListResponse, SuppliersQueryParams, WorkspaceUpdateDto,
} from '@food-suppliers/shared';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, options);
  } catch {
    throw new Error('Не удалось подключиться к серверу. Проверьте соединение и попробуйте ещё раз.');
  }
  if (!response.ok) {
    const fallback: Record<number, string> = {
      400: 'Некорректные параметры запроса. Проверьте фильтры и попробуйте ещё раз.',
      404: 'Поставщик не найден. Обновите список и попробуйте ещё раз.',
      500: 'Ошибка сервера. Попробуйте ещё раз.',
    };
    throw new Error(fallback[response.status] ?? `Ошибка сервера (${response.status}). Попробуйте ещё раз.`);
  }
  return response.json() as Promise<T>;
}

function queryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const result = query.toString();
  return result ? `?${result}` : '';
}

export const fetchSuppliers = (params: SuppliersQueryParams = {}) =>
  request<SuppliersListResponse>(`/suppliers${queryString(params)}`);
export const fetchSupplierById = (id: string, context: { region?: string; maxMoqRub?: number } = {}) =>
  request<SupplierDetailResponse>(`/suppliers/${encodeURIComponent(id)}${queryString(context)}`);
export const compareSuppliers = (payload: CompareRequestDto) =>
  request<CompareResponse>('/suppliers/compare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const updateSupplierWorkspace = (id: string, payload: WorkspaceUpdateDto) =>
  request<SupplierDetailResponse>(`/suppliers/${encodeURIComponent(id)}/workspace`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
export const fetchHealth = () => request<HealthResponse>('/health');
