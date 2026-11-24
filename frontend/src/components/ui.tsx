import type { ReactNode } from 'react';
import type { SupplierStatus, SupplierWithEvaluation } from '@food-suppliers/shared';
import * as Select from '@radix-ui/react-select';
import { ArrowUpRight, Bookmark, Check, ChevronDown, Circle, CircleHelp, LoaderCircle, MessageCircle, X } from 'lucide-react';

export const statusLabels: Record<SupplierStatus, string> = {
  new: 'Новый',
  shortlist: 'В шортлисте',
  contacted: 'Связались',
  rejected: 'Отклонён',
};

export const statuses = Object.keys(statusLabels) as SupplierStatus[];

const statusStyle = {
  new: { icon: Circle, tone: 'border-line bg-soft text-secondary' },
  shortlist: { icon: Bookmark, tone: 'border-brand-line bg-brand-soft text-brand-ink-strong' },
  contacted: { icon: MessageCircle, tone: 'border-positive-line bg-positive-soft text-positive' },
  rejected: { icon: X, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
} satisfies Record<SupplierStatus, { icon: typeof Circle; tone: string }>;

export function StatusBadge({ status, framed = true }: { status: SupplierStatus; framed?: boolean }) {
  const { icon: Icon, tone } = statusStyle[status];
  return (
    <span className={`inline-flex h-5 items-center gap-1 whitespace-nowrap text-[11px] font-medium leading-none ${framed ? 'rounded border px-1.5 ' + tone : ''}`}>
      <Icon size={11} aria-hidden="true" className="shrink-0" />
      {statusLabels[status]}
    </span>
  );
}

export function InlineStatusSelect({
  status,
  saving,
  label,
  variant = 'cell',
  onChange,
}: {
  status: SupplierStatus;
  saving?: boolean;
  label: string;
  variant?: 'cell' | 'framed';
  onChange: (next: SupplierStatus) => void;
}) {
  return (
    <div className="inline-flex max-w-full" onClick={event => event.stopPropagation()}>
      <Select.Root value={status} disabled={saving} onValueChange={value => {
        const next = statuses.find(item => item === value);
        if (next && next !== status) onChange(next);
      }}>
        <Select.Trigger
          aria-label={label}
          aria-busy={saving || undefined}
          className={`group/status flex h-7 max-w-full items-center rounded-md border text-left transition-colors focus-visible:outline-offset-[-2px]! focus-visible:[--focus-outline:var(--color-brand-ink-strong)] ${variant === 'framed' ? `gap-2 px-2 hover:brightness-95 data-[state=open]:border-brand-hover ${statusStyle[status].tone}` : 'w-32 justify-between gap-1 border-transparent px-1.5 hover:border-line-strong hover:bg-white data-[state=open]:border-brand-line data-[state=open]:bg-white'}`}
        >
          <Select.Value><StatusBadge status={status} framed={variant === 'cell'} /></Select.Value>
          {saving ? <LoaderCircle size={12} className="shrink-0 animate-spin text-muted" aria-hidden="true" /> : (
            <Select.Icon asChild><ChevronDown size={13} className="shrink-0 opacity-75 transition-transform group-data-[state=open]/status:rotate-180" aria-hidden="true" /></Select.Icon>
          )}
        </Select.Trigger>
        <Select.Portal>
          <Select.Content
            position="popper"
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className="z-[60] max-h-[var(--radix-select-content-available-height)] min-w-40 overflow-hidden rounded-lg border border-line bg-white shadow-lg"
          >
            <Select.Viewport className="space-y-0.5 p-1">
              {statuses.map(item => (
                <Select.Item
                  key={item}
                  value={item}
                  className="flex min-h-8 cursor-pointer select-none items-center justify-between gap-2 rounded-md px-2 py-1 outline-none! data-[highlighted]:bg-separator data-[state=checked]:bg-brand-soft data-[highlighted]:data-[state=checked]:bg-brand-line/50"
                >
                  <Select.ItemText><StatusBadge status={item} /></Select.ItemText>
                  <Select.ItemIndicator className="inline-flex shrink-0 text-brand-ink-strong"><Check size={14} aria-hidden="true" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export function getVerdictStyle(verdict: SupplierWithEvaluation['scoring']['verdict']) {
  if (verdict === 'recommended') {
    return {
      badge: 'border-positive-line bg-positive-soft text-positive',
      bar: 'bg-positive',
      dot: 'bg-positive',
      shortLabel: 'Рекомендуем',
    };
  }
  if (verdict === 'consider') {
    return {
      badge: 'border-line bg-canvas text-ink',
      bar: 'bg-graphite',
      dot: 'bg-muted',
      shortLabel: 'Хороший вариант',
    };
  }
  return {
    badge: 'border-caution-line bg-caution-soft text-caution',
    bar: 'bg-caution',
    dot: 'bg-caution',
    shortLabel: 'Уточнить',
  };
}

export function ScoreBadge({
  scoring,
  compact = false,
}: {
  scoring: SupplierWithEvaluation['scoring'];
  compact?: boolean;
}) {
  const style = getVerdictStyle(scoring.verdict);
  const percent = Math.max(0, Math.min(100, scoring.total));

  if (compact) {
    return (
      <span className={`num inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold ${style.badge}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
        {scoring.total}
        <span className="text-[10px] font-normal opacity-60">/100</span>
      </span>
    );
  }

  return (
    <div className={`min-w-[116px] rounded-md border px-2.5 py-2 ${style.badge}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="num text-base font-semibold leading-none">{scoring.total}</span>
        <span className="num text-[10px] opacity-65">/ 100</span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1.5 text-[10px] font-medium leading-tight">{style.shortLabel}</p>
    </div>
  );
}

export function FactList({ items, kind }: { items: string[]; kind: 'good' | 'clarify' }) {
  if (!items.length) return <p className="text-xs text-muted">Нет дополнительных пунктов</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-2 text-xs leading-relaxed text-secondary">
          {kind === 'good' ? (
            <Check size={13} className="mt-0.5 shrink-0 text-positive" />
          ) : (
            <CircleHelp size={13} className="mt-0.5 shrink-0 text-caution" />
          )}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Regions({ regions }: { regions: string[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {regions.map(region => (
        <span
          key={region}
          className="rounded border border-line bg-soft px-1.5 py-0.5 text-[11px] font-medium text-secondary"
        >
          {region}
        </span>
      ))}
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  if (!/^https?:\/\//i.test(href)) return <span className="break-all text-secondary">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 break-all font-medium text-brand-ink underline decoration-brand underline-offset-2 transition-colors hover:text-brand-ink-strong hover:decoration-brand-hover"
    >
      {children}
      <ArrowUpRight size={12} className="shrink-0" />
    </a>
  );
}

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : 'Что-то пошло не так. Попробуйте ещё раз.';
}