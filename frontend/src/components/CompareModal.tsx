import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComparisonRow, CompareResponse, SupplierStatus } from '@food-suppliers/shared';
import { ArrowRight, ArrowUpRight, BookmarkPlus, Check, ChevronDown, LoaderCircle, Search, X } from 'lucide-react';
import { compareSuppliers } from '../api/client';
import { ExternalLink, readableError } from './ui';
import { useDialog } from './useDialog';
import { CompareAssortments } from './CompareAssortments';

interface Props {
  ids: string[];
  search?: string;
  region?: string;
  maxMoqRub?: number;
  onClose: () => void;
  onOpen: (id: string, tab?: 'rfq' | 'assortment', query?: string) => void;
  onRemove: (id: string) => void;
  onStatus: (id: string, status: SupplierStatus) => Promise<void>;
}

const conditionKeys = ['regions', 'moq', 'leadTime', 'delivery', 'temperature', 'documents', 'complianceSystems', 'contacts', 'pricingNote'];

function FactBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 max-w-full items-center gap-0.5 rounded bg-[#E3F5FA] px-1.5 py-0.5 text-[10px] font-semibold text-brand-ink">
      <Check size={11} aria-hidden="true" className="shrink-0" /> <span className="[overflow-wrap:anywhere]">{label}</span>
    </span>
  );
}

function cellValue(row: ComparisonRow, id: string) {
  return row.values[id]?.trim() || 'Не указано';
}

export function CompareModal({ ids, search, region, maxMoqRub, onClose, onOpen, onRemove, onStatus }: Props) {
  const [section, setSection] = useState<'conditions' | 'assortment'>(search ? 'assortment' : 'conditions');
  const [draft, setDraft] = useState(search ?? '');
  const [productQuery, setProductQuery] = useState(search ?? '');
  const request = useMemo(() => ({ ids, region, maxMoqRub, ...(productQuery ? { search: productQuery } : {}) }), [ids, productQuery, region, maxMoqRub]);
  const [response, setResponse] = useState<{ request: typeof request; result?: CompareResponse; error?: string } | null>(null);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [pending, setPending] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialog<HTMLElement>(onClose);

  useEffect(() => {
    let active = true;
    compareSuppliers(request)
      .then(result => { if (active) setResponse({ request, result }); })
      .catch(reason => { if (active) setResponse({ request, error: readableError(reason) }); });
    return () => { active = false; };
  }, [request]);

  const current = response?.request === request ? response : null;
  const result = current?.result;
  const error = current?.error || statusError;
  const winner = result?.suppliers.find(s => s.id === result.winnerId);
  const rowsByKey = new Map(result?.rows.map(row => [row.key, row]));
  const tied = Boolean(winner && result?.suppliers.filter(s => s.scoring.total === winner.scoring.total).length !== 1);
  const visibleRows = conditionKeys.flatMap(key => {
    const row = rowsByKey.get(key);
    if (!row || (key === 'pricingNote' && !result?.suppliers.some(s => s.pricingNote?.trim()))) return [];
    const same = ids.every(id => cellValue(row, id) === cellValue(row, ids[0]));
    const ownershipDiffers = key === 'delivery' && new Set(result?.suppliers.map(s => s.delivery.hasOwnDelivery)).size > 1;
    return onlyDifferences && same && !ownershipDiffers ? [] : [row];
  });

  async function shortlist(id: string) {
    setPending(id);
    setStatusError('');
    try {
      await onStatus(id, 'shortlist');
      setResponse(previous => previous?.request === request && previous.result ? {
        ...previous,
        result: {
          ...previous.result,
          suppliers: previous.result.suppliers.map(s => s.id === id ? { ...s, workspace: { ...s.workspace, status: 'shortlist' } } : s),
        },
      } : previous);
    } catch (reason) {
      setStatusError(readableError(reason));
    } finally {
      setPending('');
    }
  }

  function remove(id: string) {
    if (ids.length <= 2 || pending) return;
    setStatusError('');
    closeButton.current?.focus({ preventScroll: true });
    onRemove(id);
  }

  return (
    <div className="overlay z-50" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="compare-title" className="modal-panel animate-rise max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)]">
        <header className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-4 border-b border-separator px-4 py-2.5 sm:px-5">
          <h2 id="compare-title" className="text-base font-bold tracking-tight text-ink sm:text-lg">Сравнение поставщиков</h2>
          <button ref={closeButton} data-dialog-initial-focus type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть сравнение"><X size={17} /></button>
        </header>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-3 py-2 sm:px-5">
          <div role="group" aria-label="Раздел сравнения" className="inline-flex rounded-md bg-soft p-0.5">
            {([{ id: 'assortment', label: 'Ассортимент' }, { id: 'conditions', label: 'Условия поставки' }] as const).map(item => (
              <button key={item.id} type="button" aria-pressed={section === item.id} onClick={() => setSection(item.id)} className={'rounded px-2.5 py-1.5 text-xs font-semibold ' + (section === item.id ? 'bg-white text-brand-ink-strong shadow-sm' : 'text-secondary hover:text-ink')}>{item.label}</button>
            ))}
          </div>
          {section === 'conditions' && <button type="button" role="switch" aria-checked={onlyDifferences} onClick={() => setOnlyDifferences(current => !current)} className="inline-flex min-h-8 items-center gap-2 rounded text-xs font-medium text-secondary hover:text-ink">
            <span aria-hidden="true" className={`relative h-4 w-7 rounded-full transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-3 before:w-3 before:rounded-full before:bg-white before:transition-transform ${onlyDifferences ? 'bg-brand-ink-strong before:translate-x-3' : 'bg-line-strong'}`} />
            Только различия
          </button>}
        </div>

        <div key={section} className="min-h-0 overflow-y-auto px-3 py-3 sm:px-5">
          {section === 'assortment' && <form role="search" aria-label="Поиск позиций в сравнении" className="mb-3 flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); setProductQuery(draft.trim()); }}>
            <label className="relative min-w-40 flex-1">
              <span className="sr-only">Товар или фасовка</span>
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={draft} onChange={event => setDraft(event.target.value)} maxLength={200} placeholder="Товар или фасовка" className="field" style={{ paddingInlineStart: '2rem' }} />
            </label>
            <button type="submit" className="btn-primary">Найти</button>
            {productQuery && <button type="button" className="btn-secondary" onClick={() => { setDraft(''); setProductQuery(''); }}>Сбросить</button>}
          </form>}
          {error && <div role="alert" className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}
          {!current && <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-secondary"><LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> Готовим сравнение…</div>}
          {result && section === 'assortment' && <CompareAssortments result={result} query={productQuery} onOpen={(id, query) => onOpen(id, 'assortment', query)} onRemove={ids.length > 2 && !pending ? remove : undefined} />}
          {result && section === 'conditions' && (
            <>
              {tied && <p className="mb-3 rounded-md border border-line bg-soft px-3 py-2 text-xs text-secondary">Несколько поставщиков набрали одинаковый максимальный балл.</p>}
              {winner && !tied && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border-l-4 border-brand bg-graphite px-3.5 py-2.5 text-white sm:flex-nowrap">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs text-graphite-muted">По условиям</span>
                      <strong className="break-words text-sm font-semibold">{winner.name}</strong>
                      <span className="num rounded bg-white/10 px-1.5 py-0.5 text-xs font-semibold">{winner.scoring.total}/100</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-snug text-graphite-muted">{result.winnerReason}</p>
                  </div>
                  <button type="button" onClick={() => onOpen(winner.id, 'rfq')} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-xs font-semibold text-graphite hover:bg-[#E3F5FA] focus-visible:outline-white">
                    Перейти к КП <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              )}

              {ids.length > 2 && <p className="mb-2 text-[11px] text-secondary sm:hidden">Листайте таблицу вправо, чтобы увидеть всех поставщиков.</p>}
              <div className="overflow-x-auto rounded-lg border border-line" role="region" aria-label="Таблица сравнения" tabIndex={0}>
                <table className={`w-full border-separate border-spacing-0 text-left text-xs sm:min-w-[28rem] ${ids.length === 2 ? 'max-sm:table-fixed' : ''}`}>
                  <thead>
                    <tr className="bg-soft">
                      <th scope="col" className="sticky left-0 z-10 w-[4.75rem] min-w-[4.75rem] border-t-2 border-transparent bg-soft px-1.5 py-2 align-top text-xs font-semibold text-secondary sm:static sm:w-44 sm:min-w-32 sm:px-3">Параметр</th>
                      {result.suppliers.map(s => (
                        <th scope="col" key={s.id} className={`min-w-[5.4rem] border-l border-line border-t-2 px-1.5 pb-2.5 pt-1.5 align-top sm:min-w-40 sm:px-3 ${!tied && s.id === result.winnerId ? 'border-t-brand bg-[#F0FAFC]' : 'border-t-transparent'}`}>
                          <div className="flex items-start justify-between gap-0.5 sm:gap-1.5">
                            <button type="button" onClick={() => onOpen(s.id)} className="min-w-0 pt-1 text-left text-xs font-semibold leading-tight [overflow-wrap:anywhere] sm:text-sm text-ink hover:text-brand-ink">
                              {s.name} <ArrowUpRight size={12} className="inline" aria-hidden="true" />
                            </button>
                            {ids.length > 2 && <button type="button" disabled={Boolean(pending)} onClick={() => remove(s.id)} aria-label={`Убрать из сравнения: ${s.name}`} title="Убрать из сравнения" className="grid size-5 shrink-0 place-items-center sm:size-6 rounded text-secondary hover:bg-line hover:text-ink disabled:hover:bg-transparent">
                              <X size={14} aria-hidden="true" />
                            </button>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="num text-xs font-semibold text-ink">{s.scoring.total}<span className="font-normal text-secondary">/100</span></span>
                          </div>
                          {s.workspace.status === 'shortlist' ? (
                            <span className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-brand px-1.5 py-1 text-[10px] font-semibold leading-tight sm:px-2 sm:text-[11px] text-white [text-shadow:0_1px_2px_#1E1F21]">
                              <Check size={12} aria-hidden="true" className="shrink-0" /> <span className="[overflow-wrap:anywhere]">В шортлисте</span>
                            </span>
                          ) : (
                            <button type="button" onClick={() => void shortlist(s.id)} disabled={Boolean(pending)} className="mt-2 inline-flex items-center gap-1 rounded-full border border-line-strong bg-white px-1.5 py-1 text-[10px] font-medium leading-tight sm:px-2 sm:text-[11px] text-ink hover:border-brand hover:bg-[#F0FAFC]">
                              {pending === s.id ? <LoaderCircle size={12} className="animate-spin" aria-hidden="true" /> : <BookmarkPlus size={12} aria-hidden="true" />}
                              <span className="[overflow-wrap:anywhere]">{pending === s.id ? 'Сохраняем…' : 'В шортлист'}</span>
                            </button>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map(row => (
                      <tr key={row.key}>
                        <th scope="row" className="sticky left-0 z-10 border-t border-line bg-white px-1.5 py-2 align-top font-semibold leading-snug text-secondary [overflow-wrap:anywhere] sm:static sm:px-3">{row.label}</th>
                        {result.suppliers.map(s => (
                          <td key={s.id} className="space-y-1 border-l border-t border-line px-1.5 py-2 align-top leading-snug break-words text-ink sm:px-3">
                            {row.key === 'contacts' ? <div className="flex flex-col items-start gap-1 [overflow-wrap:anywhere]">
                              {s.contacts.phone && <a href={`tel:${s.contacts.phone.replace(/[^+\d]/g, '')}`} className="text-brand-ink hover:underline">{s.contacts.phone}</a>}
                              {s.contacts.email && <a href={`mailto:${s.contacts.email}`} className="text-brand-ink hover:underline">{s.contacts.email}</a>}
                              {s.contacts.telegramOrWhatsapp && <ExternalLink href={s.contacts.telegramOrWhatsapp}>Мессенджер</ExternalLink>}
                              {!Object.values(s.contacts).some(Boolean) && <span>{cellValue(row, s.id)}</span>}
                            </div> : row.key === 'pricingNote' && s.pricingNote?.trim() ? <details className="group">
                              <summary className="flex cursor-pointer list-none items-center gap-1 text-brand-ink [&::-webkit-details-marker]:hidden"><ChevronDown size={12} aria-hidden="true" className="shrink-0 group-open:rotate-180" />Читать примечание</summary>
                              <p className="mt-1 [overflow-wrap:anywhere]">{cellValue(row, s.id)}</p>
                            </details> : <span className="block whitespace-pre-line [overflow-wrap:anywhere]">{cellValue(row, s.id)}</span>}
                            {row.key === 'delivery' && s.delivery.hasOwnDelivery === true && <FactBadge label="Своя доставка" />}
                            {row.key === 'moq' && row.bestSupplierIds.includes(s.id) && <FactBadge label="Мин. среди заказов в ₽" />}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!visibleRows.length && <tr><td colSpan={result.suppliers.length + 1} className="border-t border-line px-3 py-5 text-center text-secondary">{onlyDifferences ? 'По отображаемым условиям различий нет.' : 'Нет данных для сравнения.'}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
        {result && section === 'assortment' && <footer className="shrink-0 border-t border-separator px-4 py-2 text-[11px] text-secondary sm:px-5">Показаны позиции из собранной выборки. Перед сравнением цен проверьте товар, фасовку и единицу цены.</footer>}
      </section>
    </div>
  );
}
