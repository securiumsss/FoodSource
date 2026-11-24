import { requiresTemperatureControl } from '@food-suppliers/shared';
import type { SupplierWithEvaluation } from '@food-suppliers/shared';
import { ArrowUpRight, Bookmark, Check, GitCompareArrows, MapPin, PackageCheck, Snowflake, Truck } from 'lucide-react';
import { FactList, Regions, ScoreBadge, StatusBadge } from './ui';

interface Props {
  supplier: SupplierWithEvaluation;
  selected: boolean;
  atLimit: boolean;
  saving: boolean;
  onOpen: () => void;
  onCompare: () => void;
  onShortlist: () => void;
}

export function SupplierCard({ supplier: s, selected, atLimit, saving, onOpen, onCompare, onShortlist }: Props) {
  const needsCold = requiresTemperatureControl(s.category);
  const leadTime = s.delivery.leadTime?.trim();
  const hasLeadTime = Boolean(leadTime && !/^(по запросу|уточнить|уточняется|не указан|по согласованию)[.!]?$/iu.test(leadTime));
  const delivery = needsCold && hasLeadTime ? leadTime : s.delivery.terms;
  const contact = s.contacts.phone || (s.website?.replace(/^https?:\/\/(?:www\.)?/i, '').split(/[/?#]/u)[0]) || s.contacts.email || 'По запросу';
  const cold = s.delivery.temperatureControlled === true ? 'Подтверждён' : s.delivery.temperatureControlled === false ? 'Не предусмотрен' : 'Уточнить';
  const compliance = [...s.documents, ...s.complianceSystems];

  return (
    <article onClick={onOpen} className={`flex cursor-pointer h-full flex-col rounded-lg border transition-colors ${selected ? 'border-brand-line bg-brand-soft' : 'border-line bg-white hover:border-line-strong'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{s.categoryLabel}</span>
              <StatusBadge status={s.workspace.status} />
            </div>
            <h3 className="text-base font-semibold leading-snug tracking-tight text-ink">{s.name}</h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted"><MapPin size={12} />{s.city}</p>
          </div>
          <ScoreBadge scoring={s.scoring} />
        </div>

        <p className="mt-3 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-secondary">{s.description}</p>
        <div className="mt-3"><Regions regions={s.regions} /></div>

        <div className="mt-4 grid grid-cols-2 divide-x divide-y divide-separator overflow-hidden rounded-md border border-line bg-soft">
          <div className="p-3"><p className="fact-label">Мин. заказ</p><p className="fact-value num">{s.moq.label}</p></div>
          <div className="p-3"><p className="fact-label">Ориентир цены</p><p className="fact-value num">{s.priceEstimate.label}</p></div>
          <div className="p-3"><p className="fact-label flex items-center gap-1"><Truck size={11} /> Доставка</p><p className="fact-value line-clamp-2">{delivery}</p></div>
          {needsCold
            ? <div className="p-3"><p className="fact-label flex items-center gap-1"><Snowflake size={11} /> Температура</p><p className="fact-value">{cold}</p></div>
            : <div className="min-w-0 p-3"><p className="fact-label">{hasLeadTime ? 'Срок доставки' : 'Контакт'}</p><p title={hasLeadTime ? leadTime : contact} className="fact-value line-clamp-2 break-words">{hasLeadTime ? leadTime : contact}</p></div>}
        </div>

        <div className="mt-3.5 flex min-h-5 flex-wrap items-center gap-1.5">
          <PackageCheck size={13} className="shrink-0 text-muted" />
          {compliance.length > 0 ? compliance.map((item, index) => (
            <span key={`${item}-${index}`} className="rounded border border-line bg-white px-1.5 py-0.5 text-[10px] font-medium text-secondary">{item}</span>
          )) : <span className="text-[11px] text-muted">Документы не указаны на сайте</span>}
        </div>

        <div className="mt-4 grid gap-4 border-t border-separator pt-3.5 sm:grid-cols-2">
          <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-positive">Почему подходит</p><FactList kind="good" items={s.scoring.highlights.slice(0, 3)} /></div>
          <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-caution">Что уточнить</p><FactList kind="clarify" items={s.scoring.clarifications.slice(0, 2)} /></div>
        </div>

        {s.workspace.notes && (
          <p className="mt-3.5 line-clamp-2 rounded border-l-2 border-graphite bg-soft px-3 py-2 text-xs leading-relaxed text-secondary">
            <span className="font-semibold text-ink">Заметка: </span>{s.workspace.notes}
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-separator bg-soft/60 px-5 py-3">
        <button type="button" onClick={event => { event.stopPropagation(); onOpen(); }} className="btn-secondary flex-1 whitespace-nowrap">Подробнее / Запрос КП <ArrowUpRight size={14} /></button>
        <button
          type="button"
          onClick={event => { event.stopPropagation(); onCompare(); }}
          disabled={!selected && atLimit}
          aria-pressed={selected}
          className={`btn-secondary ${selected ? 'border-graphite bg-graphite text-white hover:bg-graphite-hover hover:text-white' : ''}`}
        >
          <GitCompareArrows size={13} />
          {selected ? 'Выбран' : 'Сравнить'}
        </button>
        <button
          type="button"
          onClick={event => { event.stopPropagation(); onShortlist(); }}
          disabled={saving}
          aria-label={s.workspace.status === 'shortlist' ? 'Убрать из шортлиста' : 'Добавить в шортлист'}
          className={`btn-secondary ${s.workspace.status === 'shortlist' ? 'border-brand-line bg-brand-soft text-brand-ink-strong hover:border-brand-hover' : ''}`}
        >
          {s.workspace.status === 'shortlist' ? <><Check size={13} /> В шортлисте</> : <><Bookmark size={13} /> В шортлист</>}
        </button>
      </div>
    </article>
  );
}