import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { requiresTemperatureControl } from '@food-suppliers/shared';
import type { SupplierStatus, SuppliersListResponse, SuppliersQueryParams, SupplierWithEvaluation, SupplierWorkspaceState } from '@food-suppliers/shared';
import { ArrowRight, SearchX } from 'lucide-react';
import { fetchSuppliers, updateSupplierWorkspace } from '../api/client';
import { useSupplierDetails } from '../api/useSupplierDetails';
import { CompareBar } from '../components/CompareBar';
import { CompareModal } from '../components/CompareModal';
import { CatalogPagination, type PageSize } from '../components/CatalogPagination';
import { CatalogToolbar } from '../components/CatalogToolbar';
import { Header, sidebarId } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { SupplierTable } from '../components/SupplierTable';
import { SupplierDetailDrawer, type DrawerTab, type SupplierDrawerHandle } from '../components/SupplierDetailDrawer';
import type { PurchaseQuantity } from '../components/purchaseEstimate';
import { readableError } from '../components/ui';

const emptyByStatus = {
  shortlist: { title: 'В шортлисте пока никого нет', detail: 'Добавьте сюда подходящих поставщиков из реестра.' },
  contacted: { title: 'Пока ни с кем не связались', detail: 'После звонка или письма отметьте поставщика статусом «Связались».' },
  rejected: { title: 'Отклонённых поставщиков пока нет', detail: 'Здесь появятся поставщики, которых вы отметите как отклонённых.' },
};

const sidebarStorageKey = 'foodsource.sidebarCollapsed';
const emptyItems: SupplierWithEvaluation[] = [];
const emptyIds: string[] = [];

export function CatalogPage() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem(sidebarStorageKey) === 'true'; }
    catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(sidebarStorageKey, String(sidebarCollapsed)); }
    catch { /* The layout still works when storage is unavailable. */ }
  }, [sidebarCollapsed]);
  const [filters, setFilters] = useState<SuppliersQueryParams>({});
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catalog, setCatalog] = useState<SuppliersListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<SupplierWithEvaluation[]>([]);
  const detailReturnFocusRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<SupplierDrawerHandle>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailStartTab, setDetailStartTab] = useState<DrawerTab>('overview');
  const [detailAssortmentSearch, setDetailAssortmentSearch] = useState('');
  const [detailQuantity, setDetailQuantity] = useState<PurchaseQuantity>();
  const [compareIds, setCompareIds] = useState<string[] | null>(null);
  const [savingId, setSavingId] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [pageIndex, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>('20');
  useEffect(() => {
    const value = search.trim();
    if (value === debouncedSearch) return;
    const timer = window.setTimeout(() => { setPage(0); setDebouncedSearch(value); }, 300);
    return () => window.clearTimeout(timer);
  }, [search, debouncedSearch]);
  const query = useMemo(() => ({ ...filters, search: debouncedSearch || undefined }), [filters, debouncedSearch]);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    fetchSuppliers(query).then(result => {
      if (!active) return;
      setCatalog(result);
      setSelected(current => current.map(item => result.items.find(s => s.id === item.id) ?? item));
    }).catch(reason => { if (active) setError(readableError(reason)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, refresh]);
  const emptyStatus = !search.trim() && filters.status && filters.status !== 'new' && catalog?.facets.statusCounts?.[filters.status] === 0
    ? emptyByStatus[filters.status] : null;
  const clearSearch = () => { setSearch(''); setDebouncedSearch(''); setPage(0); };
  const reset = () => { clearSearch(); setFilters({}); };
  const changeFilters = (patch: Partial<SuppliersQueryParams>) => {
    setPage(0);
    setFilters(current => {
      const next = { ...current, ...patch };
      if (next.category && !requiresTemperatureControl(next.category)) next.temperatureControlled = undefined;
      return next;
    });
  };
  const items = catalog?.items ?? emptyItems;
  const size = Number(pageSize);
  const page = Math.min(pageIndex, Math.max(0, Math.ceil(items.length / size) - 1));
  useEffect(() => { if (page !== pageIndex) setPage(page); }, [page, pageIndex]);
  const pageItems = useMemo(() => items.slice(page * size, (page + 1) * size), [items, page, size]);
  const pageIds = useMemo(() => pageItems.map(item => item.id), [pageItems]);
  const { detail, loadError, updateWorkspace } = useSupplierDetails(detailId, filters.region, filters.maxMoqRub, loading ? emptyIds : pageIds);
  const saved = useCallback((id: string, workspace: SupplierWorkspaceState) => {
    updateWorkspace(id, workspace);
    setCatalog(current => current && ({ ...current, items: current.items.map(s => s.id === id ? { ...s, workspace } : s) }));
    setSelected(current => current.map(s => s.id === id ? { ...s, workspace } : s));
    setRefresh(n => n + 1);
  }, [updateWorkspace]);
  const changeStatus = useCallback(async (id: string, status: SupplierStatus) => {
    setSavingId(id); setError('');
    try { const result = await updateSupplierWorkspace(id, { status }); saved(id, result.workspace); }
    finally { setSavingId(''); }
  }, [saved]);
  const toggleCompare = (supplier: SupplierWithEvaluation) => setSelected(current => current.some(item => item.id === supplier.id) ? current.filter(item => item.id !== supplier.id) : current.length < 4 ? [...current, supplier] : current);
  const openDrawer = (id: string, tab?: DrawerTab, assortmentSearch = '', quantity?: PurchaseQuantity) => {
    if (detailId === id && !tab) return;
    if (detailId !== null && drawerRef.current?.canSwitchSupplier() === false) return;
    detailReturnFocusRef.current = null;
    const index = items.findIndex(item => item.id === id);
    if (index >= 0) setPage(Math.floor(index / size));
    setDetailStartTab(tab ?? 'overview');
    setDetailAssortmentSearch(assortmentSearch);
    setDetailQuantity(quantity);
    setDetailId(id);
  };
  const removeFromComparison = (id: string) => {
    if (!compareIds || compareIds.length <= 2) return;
    setCompareIds(current => current && current.length > 2 ? current.filter(item => item !== id) : current);
    setSelected(current => current.filter(s => s.id !== id));
  };
  const detailIndex = items.findIndex(s => s.id === detailId);
  const detailPreview = items[detailIndex] ?? selected.find(s => s.id === detailId);
  const closeDrawer = useCallback(() => setDetailId(null), []);
  const closeCompare = useCallback(() => setCompareIds(null), []);
  const tableGutters = 'px-4 sm:px-6';
  const sectionTitle = filters.status === 'shortlist' ? 'Шортлист' : filters.status === 'contacted' ? 'Связались' : filters.status === 'rejected' ? 'Отклонённые' : 'Все поставщики';
  const catalogTitle = catalog?.facets.categories.find(category => category.value === filters.category)?.label ?? sectionTitle;
  return <div className="flex h-dvh flex-col overflow-hidden lg:flex-row">
    <Sidebar
      id={sidebarId}
      collapsed={sidebarCollapsed}
      status={filters.status}
      category={filters.category}
      facets={catalog?.facets ?? null}
      selectedCount={selected.length}
      onStatusChange={status => changeFilters({ status })}
      onCategoryChange={category => changeFilters({ category })}
      onCompare={() => setCompareIds(selected.map(s => s.id))}
    />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Header
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(current => !current)}
      />
    <main className="flex min-h-0 min-w-0 flex-1 flex-col pt-3 lg:pt-4">
      <div className={'shrink-0 ' + tableGutters}>
        <div className="mb-2.5 flex items-baseline gap-2.5">
          <h1 className="min-w-0 text-sm font-semibold text-ink lg:text-base">{catalogTitle}</h1>
          {catalog && <span className="inline-flex shrink-0 items-baseline gap-2 text-xs text-muted">
            <span aria-hidden="true">·</span><span className="sr-only">Найдено поставщиков: </span><span className="num">{catalog.total}</span>
          </span>}
        </div>
        {selected.length > 0 ? <CompareBar
          selected={selected}
          onRemove={id => setSelected(current => current.filter(s => s.id !== id))}
          onClear={() => setSelected([])}
          onCompare={() => setCompareIds(selected.map(s => s.id))}
        /> : <CatalogToolbar
          filters={filters}
          facets={catalog?.facets ?? null}
          search={search}
          onSearchChange={setSearch}
          onClearSearch={clearSearch}
          onChange={changeFilters}
          onReset={reset}
        />}
      </div>
      <section aria-label="Результаты поиска" className="flex min-h-0 flex-1 flex-col">
        {error && (
          <div className={'shrink-0 ' + tableGutters}>
            <div role="alert" className="mb-4 rounded-lg border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{error} <button onClick={() => setRefresh(n => n + 1)} className="ml-1 font-bold underline">Повторить</button></div>
          </div>
        )}
        <SupplierTable
          suppliers={pageItems}
          scrollKey={`${page}:${pageSize}:${JSON.stringify(query)}`}
          regionFilter={filters.region}
          emptyContent={error ? undefined : loading ? (
            <p role="status" className="text-xs text-secondary">Загрузка поставщиков…</p>
          ) : (
            <>
              <span className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-separator text-secondary" aria-hidden="true"><SearchX size={16} /></span>
              <h3 className="mt-3 text-sm font-semibold text-ink">{emptyStatus?.title ?? 'Ничего не нашлось'}</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-secondary">{emptyStatus?.detail ?? 'Попробуйте изменить запрос или ослабить условия фильтрации.'}</p>
              {!emptyStatus && <button type="button" onClick={reset} className="btn-secondary mt-4">Сбросить фильтры <ArrowRight size={14} /></button>}
            </>
          )}
          activeId={detailId}
          returnFocusRef={detailReturnFocusRef}
          selectedIds={selected.map(s => s.id)}
          atLimit={selected.length >= 4}
          savingId={savingId}
          dimmed={loading && items.length > 0}
          onOpen={(id, tab) => openDrawer(id, tab, tab === 'assortment' && items.some(item => item.id === id && item.matchedProducts?.length) ? debouncedSearch : '')}
          onCompare={toggleCompare}
          onStatusChange={(id, status) => void changeStatus(id, status).catch(reason => setError(readableError(reason)))}
        />
        {catalog && <CatalogPagination
          page={page}
          size={pageSize}
          total={items.length}
          onPageChange={setPage}
          onSizeChange={next => { setPageSize(next); setPage(0); }}
        />}
      </section>
    </main>
    {detailId && (
      <SupplierDetailDrawer
        ref={drawerRef}
        id={detailId}
        supplier={detail}
        preview={detailPreview}
        loadError={loadError === undefined ? '' : readableError(loadError)}
        initialTab={detailStartTab}
        assortmentSearch={detailAssortmentSearch}
        purchaseQuantity={detailQuantity}
        deliveryRegion={filters.region}
        matchedProductIds={items[detailIndex]?.matchedProducts?.map(product => product.id)}
        navigation={detailIndex >= 0 ? {
          position: detailIndex + 1,
          total: items.length,
          previous: items[detailIndex - 1]?.id,
          next: items[detailIndex + 1]?.id,
          onNavigate: openDrawer,
        } : undefined}
        returnFocusRef={detailReturnFocusRef}
        selected={selected.some(s => s.id === detailId)}
        atLimit={selected.length >= 4}
        onCompare={toggleCompare}
        onClose={closeDrawer}
        onSaved={saved}
      />
    )}
    {compareIds && <CompareModal ids={compareIds} search={debouncedSearch || undefined} region={filters.region} maxMoqRub={filters.maxMoqRub} onClose={closeCompare} onOpen={(id, tab, query, quantity) => { closeCompare(); openDrawer(id, tab ?? 'overview', query, quantity); }} onRemove={removeFromComparison} onStatus={changeStatus} />}
  </div></div>;
}
