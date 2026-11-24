import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { FilterSelect } from './FilterSelect';

const sizes = ['10', '20', '50'] as const;
export type PageSize = typeof sizes[number];
const options = sizes.map(value => ({ value, label: value }));

export function CatalogPagination({ page, size, total, onPageChange, onSizeChange }: {
  page: number;
  size: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onSizeChange: (size: PageSize) => void;
}) {
  const offset = page * Number(size);
  const last = Math.max(0, Math.ceil(total / Number(size)) - 1);
  const range = total ? `${offset + 1}–${Math.min(offset + Number(size), total)} из ${total}` : '0 из 0';
  const buttons = [
    { label: 'Первая страница', target: 0, disabled: page === 0, Icon: ChevronsLeft },
    { label: 'Предыдущая страница', target: page - 1, disabled: page === 0, Icon: ChevronLeft },
    { label: 'Следующая страница', target: page + 1, disabled: page === last, Icon: ChevronRight },
    { label: 'Последняя страница', target: last, disabled: page === last, Icon: ChevronsRight },
  ];

  return (
    <nav aria-label="Страницы поставщиков" className="flex min-h-11 shrink-0 items-center justify-end gap-2 border-b border-line bg-white px-2 sm:min-h-12 sm:gap-4 sm:px-5">
      <FilterSelect compactSuffix="на странице" label="Записей на странице" value={size} options={options} onChange={onSizeChange} />
      <span role="status" className="num whitespace-nowrap text-xs font-semibold text-ink">{range}</span>
      <div className="flex items-center gap-0.5">
        {buttons.map(({ label, target, disabled, Icon }) => (
          <button
            key={label}
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            className="grid size-8 place-items-center rounded-md text-ink hover:bg-soft disabled:text-muted disabled:opacity-50 disabled:hover:bg-transparent sm:size-9"
            onClick={() => onPageChange(target)}
          ><Icon size={16} aria-hidden="true" /></button>
        ))}
      </div>
    </nav>
  );
}
