import { useEffect, useMemo, useRef, useState } from 'react';
import { requiresTemperatureControl } from '@food-suppliers/shared';
import type { ComparisonRow, CompareResponse, SupplierStatus } from '@food-suppliers/shared';
import { ArrowRight, ArrowUpRight, BookmarkPlus, Check, LoaderCircle, X } from 'lucide-react';
import { compareSuppliers } from '../api/client';
import { readableError } from './ui';
import { useDialog } from './useDialog';

interface Props {
  ids: string[];
  region?: string;
  maxMoqRub?: number;
  onClose: () => void;
  onOpen: (id: string, tab?: 'rfq') => void;
  onRemove: (id: string) => void;
  onStatus: (id: string, status: SupplierStatus) => Promise<void>;
}

const rowGroups = [
  ['regions'], ['moq'], ['price'], ['delivery'], ['temperature'],
  ['documents', 'complianceSystems'], ['contacts'], ['pricingNote'],
];

function BestBadge({ label = 'Лучшее' }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 max-w-full items-center gap-0.5 rounded bg-[#E3F5FA] px-1.5 py-0.5 text-[10px] font-semibold text-brand-ink">
      <Check size={11} aria-hidden="true" className="shrink-0" /> <span className="[overflow-wrap:anywhere]">{label}</span>
    </span>
  );
}

function cellValue(row: ComparisonRow, id: string) {
  return row.values[id]?.trim() || 'Не указано';
}

export function CompareModal({ ids, region, maxMoqRub, onClose, onOpen, onRemove, onStatus }: Props) {
  const request = useMemo(() => ({ ids, region, maxMoqRub }), [ids, region, maxMoqRub]);
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
  const compareTemperature = result?.suppliers.some(s => requiresTemperatureControl(s.category));
  const visibleRows = rowGroups.flatMap(keys => {
    const rows = keys.flatMap(key => {
      const row = rowsByKey.get(key);
      return row && (key !== 'temperature' || compareTemperature) ? [row] : [];
    });
    if (!rows.length || (onlyDifferences && rows.every(row => ids.every(id => cellValue(row, id) === cellValue(row, ids[0]))))) return [];
    return [{ key: keys[0], label: keys.length === 1 ? rows[0].label : 'Документы и системы прослеживаемости', rows }];
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
        <header className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b border-separator px-4 py-2.5 sm:grid-cols-[1fr_auto_auto] sm:px-5">
          <h2 id="compare-title" className="text-base font-bold tracking-tight text-ink sm:text-lg">Сравнение поставщиков</h2>
          <label className="order-last inline-flex w-fit cursor-pointer items-center gap-2 text-xs font-medium text-secondary sm:order-none">
            <input type="checkbox" role="switch" checked={onlyDifferences} onChange={event => setOnlyDifferences(event.target.checked)} className="peer sr-only" />
            <span aria-hidden="true" className="relative h-4 w-7 rounded-full bg-line-strong transition-colors before:absolute before:left-0.5 before:top-0.5 before:h-3 before:w-3 before:rounded-full before:bg-white before:transition-transform peer-checked:bg-brand-ink-strong peer-checked:before:translate-x-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-graphite" />
            Только различия
          </label>
          <button ref={closeButton} data-dialog-initial-focus type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть сравнение"><X size={17} /></button>
        </header>

        <div className="min-h-0 overflow-y-auto px-3 py-3 sm:px-5">
          {error && <div role="alert" className="mb-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</div>}
          {!current && <div role="status" className="flex min-h-32 items-center justify-center gap-2 text-sm text-secondary"><LoaderCircle className="animate-spin" size={16} aria-hidden="true" /> Готовим сравнение…</div>}
          {result && (
            <>
              {winner && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border-l-4 border-brand bg-graphite px-3.5 py-2.5 text-white sm:flex-nowrap">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-xs text-graphite-muted">Лидер</span>
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
                        <th scope="col" key={s.id} className={`min-w-[5.4rem] border-l border-line border-t-2 px-1.5 pb-2.5 pt-1.5 align-top sm:min-w-40 sm:px-3 ${s.id === result.winnerId ? 'border-t-brand bg-[#F0FAFC]' : 'border-t-transparent'}`}>
                          <div className="flex items-start justify-between gap-0.5 sm:gap-1.5">
                            <button type="button" onClick={() => onOpen(s.id)} className="min-w-0 pt-1 text-left text-xs font-semibold leading-tight [overflow-wrap:anywhere] sm:text-sm text-ink hover:text-brand-ink">
                              {s.name} <ArrowUpRight size={12} className="inline" aria-hidden="true" />
                            </button>
                            <button type="button" disabled={ids.length <= 2 || Boolean(pending)} onClick={() => remove(s.id)} aria-label={`Убрать из сравнения: ${s.name}`} title={ids.length <= 2 ? 'Для сравнения нужны минимум два поставщика' : 'Убрать из сравнения'} className="grid size-5 shrink-0 place-items-center sm:size-6 rounded text-secondary hover:bg-line hover:text-ink disabled:hover:bg-transparent">
                              <X size={14} aria-hidden="true" />
                            </button>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="num text-xs font-semibold text-ink">{s.scoring.total}<span className="font-normal text-secondary">/100</span></span>
                            {rowsByKey.get('score')?.bestSupplierIds.includes(s.id) && <BestBadge />}
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
                    {visibleRows.map(group => (
                      <tr key={group.key}>
                        <th scope="row" className="sticky left-0 z-10 border-t border-line bg-white px-1.5 py-2 align-top font-semibold leading-snug text-secondary [overflow-wrap:anywhere] sm:static sm:px-3">{group.label}</th>
                        {result.suppliers.map(s => (
                          <td key={s.id} className="space-y-1.5 border-l border-t border-line px-1.5 py-2 align-top leading-snug break-words text-ink sm:px-3">
                            {group.rows.map(row => (
                              <div key={row.key}>
                                {group.rows.length > 1 && <span className="mb-0.5 block text-[11px] font-medium text-secondary">{row.label}</span>}
                                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                                  <span className="min-w-0 max-w-full [overflow-wrap:anywhere]">{cellValue(row, s.id)}</span>
                                  {row.bestSupplierIds.includes(s.id) && <BestBadge label={row.key === 'delivery' ? 'Своя доставка' : undefined} />}
                                </div>
                              </div>
                            ))}
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
        {result && <footer className="shrink-0 border-t border-separator px-4 py-2 text-[11px] text-secondary sm:px-5">Ценовые ориентиры могут относиться к разным товарам или фасовкам.</footer>}
      </section>
    </div>
  );
}
