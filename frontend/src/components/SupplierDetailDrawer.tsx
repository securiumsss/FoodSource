import { requiresTemperatureControl } from '@food-suppliers/shared';
import { useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type Ref, type RefObject } from 'react';
import type { SupplierDetailResponse, SupplierWithEvaluation, SupplierWorkspaceState, WorkspaceUpdateDto } from '@food-suppliers/shared';
import { ArrowDown, ArrowUp, Check, Clipboard, GitCompareArrows, LoaderCircle, Mail, Phone, X } from 'lucide-react';
import { updateSupplierWorkspace } from '../api/client';
import { ExternalLink, FactList, getVerdictStyle, InlineStatusSelect, readableError, Regions, ScoreBadge } from './ui';
import { useDialog } from './useDialog';
import { describeProduct, SupplierAssortmentPanel } from './SupplierAssortmentPanel';

export type DrawerTab = 'overview' | 'assortment' | 'workspace' | 'rfq';

export interface SupplierDrawerHandle {
  canSwitchSupplier: () => boolean;
}

function useDockedDrawer() {
  const query = '(min-width: 64rem)';
  const [docked, setDocked] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setDocked(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return docked;
}

const drawerToolbarButton = 'grid h-9 w-9 place-items-center rounded text-secondary transition-colors hover:bg-separator hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-graphite aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-transparent';

interface Props {
  ref?: Ref<SupplierDrawerHandle>;
  id: string;
  supplier: SupplierDetailResponse | null;
  loadError: string;
  initialTab?: DrawerTab;
  supplierName?: string;
  matchedProductIds?: string[];
  navigation?: {
    position: number;
    total: number;
    previous?: string;
    next?: string;
    onNavigate: (id: string) => void;
  };
  returnFocusRef?: RefObject<HTMLElement | null>;
  selected: boolean;
  atLimit: boolean;
  onCompare: (supplier: SupplierWithEvaluation) => void;
  onClose: () => void;
  onSaved: (id: string, workspace: SupplierWorkspaceState) => void;
}

function Tags({ items }: { items: string[] }) {
  return items.length > 0 ? (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={`${item}-${i}`} className="rounded border border-line bg-soft px-2 py-0.5 text-xs text-ink">
          {item}
        </span>
      ))}
    </div>
  ) : (
    <p className="text-xs text-muted">Не указаны на открытых страницах — уточните при запросе</p>
  );
}

function sourceLabel(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const segment = parts.at(-1);
    const readable = segment ? decodeURIComponent(segment) : '';
    const short = readable.length > 24 ? readable.slice(0, 23) + '…' : readable;
    return url.hostname.replace(/^www\./i, '') + (short ? (parts.length > 1 ? '/…/' : '/') + short : '');
  } catch {
    return value;
  }
}

export function SupplierDetailDrawer({ ref, id, supplier: s, loadError, initialTab = 'overview', supplierName, matchedProductIds = [], navigation, returnFocusRef, selected, atLimit, onCompare, onClose, onSaved }: Props) {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [rfqProductIds, setRfqProductIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ id: string; notes: string } | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const docked = useDockedDrawer();
  const notes = draft?.id === id ? draft.notes : s?.workspace.notes ?? '';
  const message = error || loadError;

  useEffect(() => {
    setCopiedKey(null);
    setSaved(false);
    setTab(initialTab);
  }, [id, initialTab]);

  useEffect(() => { setError(''); setDraft(null); setRfqProductIds([]); }, [id]);

  const dialogRef = useDialog<HTMLElement>(onClose, returnFocusRef, !docked);
  useEffect(() => {
    const panel = dialogRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  }, [id, dialogRef]);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  async function save(update: WorkspaceUpdateDto) {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const result = await updateSupplierWorkspace(id, update);
      onSaved(id, result.workspace);
      if (update.notes !== undefined) setDraft(null);
      setSaved(true);
    } catch (reason) {
      setError(readableError(reason));
    } finally {
      setSaving(false);
      if (document.activeElement === document.body) closeButtonRef.current?.focus({ preventScroll: true });
    }
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(current => (current === key ? null : current)), 2000);
    } catch {
      setError('Не удалось скопировать текст. Выделите и скопируйте его вручную.');
    }
  }

  const hasDraft = draft?.id === id && notes !== s?.workspace.notes;
  const navigationBlocked = saving || hasDraft;
  useImperativeHandle(ref, () => ({
    canSwitchSupplier: () => {
      if (!navigationBlocked) return true;
      dialogRef.current?.focus({ preventScroll: true });
      return false;
    },
  }), [dialogRef, navigationBlocked]);

  function navigate(direction: 'previous' | 'next') {
    const nextId = navigation?.[direction];
    if (!navigation || !nextId || navigationBlocked) return;

    if (!document.activeElement?.closest('[data-supplier-navigation]')) {
      dialogRef.current?.focus({ preventScroll: true });
    }
    navigation.onNavigate(nextId);
  }

  function handleNavigationKey(event: KeyboardEvent<HTMLElement>) {
    if (!navigation || event.defaultPrevented || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable], [role="combobox"], [role="listbox"]')) return;

    event.preventDefault();
    navigate(event.key === 'ArrowUp' ? 'previous' : 'next');
  }

  const rfqProducts = s?.assortment?.products.filter(product => rfqProductIds.includes(product.id)) ?? [];
  const rfqBody = s && (rfqProducts.length ? (() => {
    const details = 'Пожалуйста, сообщите наличие, оптовую цену и минимальный объём по следующим позициям:\n'
      + rfqProducts.map(product => '• ' + describeProduct(product)).join('\n');
    const signature = s.rfqTemplate.body.lastIndexOf('\n\nС уважением,');
    return signature === -1 ? s.rfqTemplate.body + '\n\n' + details
      : s.rfqTemplate.body.slice(0, signature) + '\n\n' + details + s.rfqTemplate.body.slice(signature);
  })() : s.rfqTemplate.body);
  const verdictStyle = s ? getVerdictStyle(s.scoring.verdict) : null;
  const limitations = s ? [...new Map([...s.cons, ...s.scoring.clarifications].map(item =>
    [item.trim().toLocaleLowerCase('ru-RU').replace(/[.!?]+$/u, ''), item],
  )).values()].slice(0, 4) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-graphite/10 sm:bg-transparent lg:pointer-events-none"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}
    >
      <aside ref={dialogRef} role="dialog" aria-modal={!docked || undefined} aria-labelledby="detail-title" tabIndex={-1} data-dialog-initial-focus onKeyDown={handleNavigationKey} className="drawer-panel animate-drawer pointer-events-auto outline-none!">
        <div role="group" aria-label="Управление карточкой" className="flex h-11 shrink-0 items-center px-3 sm:px-4">
          {navigation && (
            <div data-supplier-navigation role="group" aria-label="Навигация по таблице" className="flex items-center gap-0.5">
              <span role="status" className="sr-only">{s?.name ?? supplierName}, {navigation.position} из {navigation.total}</span>
              {([
                { direction: 'previous', label: 'Предыдущий поставщик', key: 'ArrowUp', hint: '↑', Icon: ArrowUp },
                { direction: 'next', label: 'Следующий поставщик', key: 'ArrowDown', hint: '↓', Icon: ArrowDown },
              ] as const).map(({ direction, label, key, hint, Icon }) => (
                <button
                  key={direction}
                  type="button"
                  className={drawerToolbarButton}
                  aria-label={label}
                  aria-keyshortcuts={key}
                  aria-disabled={navigationBlocked || !navigation[direction]}
                  title={label + ' (' + hint + ')'}
                  onClick={() => navigate(direction)}
                ><Icon size={17} /></button>
              ))}
            </div>
          )}
          <button ref={closeButtonRef} type="button" onClick={onClose} className={drawerToolbarButton + ' ml-auto'} aria-label="Закрыть карточку" title="Закрыть карточку (Esc)"><X size={17} /></button>
        </div>
        <div className="shrink-0 border-b border-line px-5 pt-1 sm:px-6">
          <p className="eyebrow mb-1">{s ? `${s.categoryLabel} · ${s.city}` : 'Карточка поставщика'}</p>
          <h2 id="detail-title" className="min-w-0 break-words text-lg font-semibold tracking-tight text-ink">
            {s?.name ?? supplierName ?? 'Карточка поставщика'}
          </h2>
          <div className="my-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {s && (
              <div role="group" aria-label="Действия с поставщиком" className="flex flex-wrap items-center gap-2">
                <ScoreBadge scoring={s.scoring} compact />
                <InlineStatusSelect
                  status={s.workspace.status}
                  variant="framed"
                  saving={saving}
                  label={`Статус для ${s.name}`}
                  onChange={next => { if (next !== s.workspace.status) void save({ status: next }); }}
                />
                <button
                  type="button"
                  className={`btn-secondary h-7 px-2 py-0 text-[11px] ${selected ? 'border-brand-line bg-brand-soft text-brand-ink-strong' : ''}`}
                  aria-pressed={selected}
                  disabled={!selected && atLimit}
                  title={selected ? 'Убрать из сравнения' : atLimit ? 'Можно сравнить не более 4 поставщиков' : 'Добавить к сравнению'}
                  onClick={() => onCompare(s)}
                >
                  {selected ? <Check size={12} /> : <GitCompareArrows size={12} />}
                  {selected ? 'В сравнении' : 'Сравнить'}
                </button>
              </div>
            )}
          </div>
          {navigation && hasDraft && <p className="mb-2 text-[11px] text-secondary">Сохраните или отмените изменения, чтобы перейти к другой записи.</p>}

          {s && (
            <div role="tablist" aria-label="Разделы карточки поставщика" className="mt-4 flex flex-wrap gap-x-3 gap-y-1 sm:gap-x-5">
              {(
                [
                  { id: 'overview', label: 'Обзор и скоринг' },
                  { id: 'assortment', label: 'Ассортимент' },
                  { id: 'workspace', label: 'Заметки', dot: Boolean(s.workspace.notes.trim()) },
                  { id: 'rfq', label: 'Запрос КП', count: s.rfqTemplate.checklist.length },
                ] as Array<{ id: DrawerTab; label: string; dot?: boolean; count?: number }>
              ).map(item => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-description={item.dot ? 'Есть сохранённая заметка' : undefined}
                    onClick={() => setTab(item.id)}
                    className={`relative inline-flex items-center gap-1.5 border-b-2 pb-2.5 text-xs font-medium transition-colors ${
                      active ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {item.label}
                    {item.dot && <span aria-hidden="true" title="Есть сохранённая заметка" className="h-1.5 w-1.5 rounded-full bg-brand" />}
                    {item.count !== undefined && item.count > 0 && (
                      <span className="num rounded bg-canvas px-1.5 py-0.5 text-[10px] text-secondary">{item.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div key={id} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {message && <div role="alert" className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-800">{message}</div>}
          {!s && !message && <div className="flex min-h-52 items-center justify-center gap-2 text-xs text-muted"><LoaderCircle size={16} className="animate-spin" />Загружаем карточку...</div>}

          {s && tab === 'overview' && (
            <div className="space-y-6">
              <div>
                <p className="text-xs leading-relaxed text-secondary">{s.description}</p>
                <div className="mt-3"><Regions regions={s.regions} /></div>
              </div>

              <section aria-label="Контакты и источники" className="space-y-2 border-t border-separator pt-4 text-xs">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  {s.contacts.phone && <a className="inline-flex items-center gap-1.5 text-brand-ink underline decoration-brand underline-offset-2 hover:text-brand-ink-strong" href={`tel:${s.contacts.phone.replace(/[^+\d]/g, '')}`}><Phone size={13} />{s.contacts.phone}</a>}
                  {s.contacts.email && <a className="inline-flex items-center gap-1.5 text-brand-ink underline decoration-brand underline-offset-2 hover:text-brand-ink-strong" href={`mailto:${s.contacts.email}`}><Mail size={13} />{s.contacts.email}</a>}
                  {s.contacts.telegramOrWhatsapp && <ExternalLink href={s.contacts.telegramOrWhatsapp}>{s.contacts.telegramOrWhatsapp}</ExternalLink>}
                  {s.website && <ExternalLink href={s.website}>Официальный сайт</ExternalLink>}
                </div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span className="fact-label">Источники</span>{Array.from(new Set([s.sourceUrl, ...s.sourceUrls])).map(url => <ExternalLink key={url} href={url}>{sourceLabel(url)}</ExternalLink>)}</div>
              </section>

              <div className="grid gap-4 rounded-md border border-line bg-soft p-3.5 sm:grid-cols-[3fr_2fr]">
                <section className="min-w-0">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em]">Условия и доставка</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <div><dt className="fact-label">Минимальный заказ</dt><dd className="fact-value">{s.moq.label}</dd></div>
                    <div><dt className="fact-label">Пример цены</dt><dd className="fact-value">{s.priceEstimate.label}</dd></div>
                    <div><dt className="fact-label">Срок доставки</dt><dd className="fact-value">{s.delivery.leadTime ?? 'По запросу'}</dd></div>
                    <div><dt className="fact-label">Своя доставка</dt><dd className="fact-value">{s.delivery.hasOwnDelivery === null ? 'Не подтверждена' : s.delivery.hasOwnDelivery ? 'Да' : 'Нет'}</dd></div>
                    {requiresTemperatureControl(s.category) && <div><dt className="fact-label">Температурный режим</dt><dd className="fact-value">{s.delivery.temperatureControlled === null ? 'Не подтверждён' : s.delivery.temperatureControlled ? 'Подтверждён' : 'Нет'}</dd></div>}
                    <div className="col-span-2"><dt className="fact-label">Условия доставки</dt><dd className="fact-value">{s.delivery.terms}</dd></div>
                  </dl>
                  {s.pricingNote && <p className="mt-3 border-l-2 border-line pl-2.5 text-[11px] leading-relaxed text-secondary">{s.pricingNote}</p>}
                </section>

                <section className="min-w-0 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em]">Документы</h3>
                  <div><p className="fact-label mb-2">Подтверждения</p><Tags items={s.documents} /></div>
                  <div><p className="fact-label mb-2">Системы и стандарты</p><Tags items={s.complianceSystems} /></div>
                </section>
              </div>

              <section className="border-t border-separator pt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-ink">Как рассчитан скоринг</h3>
                  <span className="num text-xs font-medium text-secondary">{s.scoring.total} / 100 · {s.scoring.verdictLabel}</span>
                </div>
                <div className="mt-4 space-y-3.5">
                  {s.scoring.breakdown.map(item => (
                    <div key={item.key}>
                      <div className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="font-medium text-ink">{item.label}</span>
                        <span className="num text-[11px] text-secondary">{item.score} / {item.maxScore}</span>
                      </div>
                      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                        <div className={`h-full rounded-full ${verdictStyle?.bar ?? 'bg-graphite'}`} style={{ width: `${Math.max(0, Math.min(100, (item.score / item.maxScore) * 100))}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">{item.detail}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-5 grid gap-4 rounded-md border border-line bg-soft p-3.5 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink">Преимущества</p>
                    <FactList items={s.pros} kind="good" />
                  </div>
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink">Ограничения и что уточнить</p>
                    <FactList items={limitations} kind="clarify" />
                  </div>
                </div>
              </section>
            </div>
          )}

          {s && tab === 'assortment' && <SupplierAssortmentPanel supplier={s} matches={matchedProductIds} onRequest={productId => {
            setRfqProductIds(current => current.includes(productId) ? current : [...current, productId]);
            setCopiedKey(null);
            setTab('rfq');
          }} />}

          {s && tab === 'workspace' && (
            <div className="space-y-5">
              <div><label htmlFor="workspace-notes" className="filter-label">Заметки менеджера</label><textarea id="workspace-notes" className="field mt-2 min-h-36 resize-y" maxLength={2000} disabled={saving} value={notes} onChange={event => { setDraft(event.target.value === s.workspace.notes ? null : { id, notes: event.target.value }); setSaved(false); }} placeholder="Договорённости, вопросы и следующие шаги" /><p className="mt-1 text-right text-[11px] text-muted">{notes.length} / 2000</p></div>
              <div className="flex items-center gap-3"><button type="button" className="btn-primary" disabled={saving} onClick={() => void save({ notes })}>{saving && <LoaderCircle size={14} className="animate-spin" />}Сохранить изменения</button>{hasDraft && <button type="button" className="btn-secondary" disabled={saving} onClick={() => { setDraft(null); closeButtonRef.current?.focus({ preventScroll: true }); }}>Отменить изменения</button>}{saved && <span role="status" className="inline-flex items-center gap-1 text-xs text-positive"><Check size={14} />Сохранено</span>}</div>
            </div>
          )}

          {s && rfqBody !== null && tab === 'rfq' && (
            <div className="space-y-5">
              <div><h3 className="text-xs font-semibold uppercase tracking-[0.08em]">Что спросить перед заказом</h3><div className="mt-3"><FactList items={s.rfqTemplate.checklist} kind="clarify" /></div></div>
              {rfqProducts.length > 0 && <section aria-label="Позиции в запросе" className="space-y-2">
                <h3 className="text-xs font-semibold text-ink">Позиции в запросе</h3>
                <ul className="space-y-1">{rfqProducts.map(product => <li key={product.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1 text-xs text-secondary">
                  <span>{describeProduct(product)}</span>
                  <button type="button" aria-label={`Убрать из запроса: ${product.name}`} className="grid size-7 shrink-0 place-items-center rounded hover:bg-separator" onClick={() => { setRfqProductIds(current => current.filter(id => id !== product.id)); setCopiedKey(null); }}><X size={14} aria-hidden="true" /></button>
                </li>)}</ul>
              </section>}
              <div className="rounded-md border border-line bg-soft p-4"><p className="fact-label">Тема</p><p className="mt-1 text-xs font-medium">{s.rfqTemplate.subject}</p><p className="fact-label mt-4">Текст письма</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-secondary">{rfqBody}</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" onClick={() => void copyText('rfq', `Тема: ${s.rfqTemplate.subject}\n\n${rfqBody}`)}>{copiedKey === 'rfq' ? <Check size={14} /> : <Clipboard size={14} />}{copiedKey === 'rfq' ? 'Скопировано' : 'Скопировать текст КП'}</button>{s.contacts.email && <a className="btn-secondary" href={`mailto:${s.contacts.email}?subject=${encodeURIComponent(s.rfqTemplate.subject)}&body=${encodeURIComponent(rfqBody)}`}><Mail size={14} />Написать письмо</a>}</div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
