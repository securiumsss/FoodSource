import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export const sidebarId = 'catalog-sidebar';

interface HeaderProps {
  context: string;
  total?: number;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function Header({
  context,
  total,
  sidebarCollapsed,
  onToggleSidebar,
}: HeaderProps) {
  const ToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const toggleLabel = sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню';
  return (
    <header className="sticky top-0 z-20 hidden h-shell-header shrink-0 items-center border-b border-line bg-white/95 backdrop-blur-sm lg:flex">
      <div className="flex w-full items-center gap-3 px-4 py-2 sm:px-6 lg:pl-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!sidebarCollapsed}
          aria-controls={sidebarId}
          className="hidden size-8 shrink-0 place-items-center rounded-md text-secondary transition-colors hover:bg-separator hover:text-ink lg:grid"
        >
          <ToggleIcon size={19} aria-hidden="true" />
        </button>
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{context}</span>
        {total !== undefined && (
          <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted">
            <span aria-hidden="true">·</span>
            <span className="num" aria-label={`Поставщиков: ${total}`}>{total}</span>
          </span>
        )}
      </div>
    </header>
  );
}