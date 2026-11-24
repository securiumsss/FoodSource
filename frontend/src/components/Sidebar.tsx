import * as Popover from '@radix-ui/react-popover';
import type { SupplierCategory, SuppliersListResponse, SupplierStatus } from '@food-suppliers/shared';
import { Bookmark, Check, ChevronDown, GitCompareArrows, Layers3, LayoutGrid, MessageCircle, Milk, Package, Snowflake, Sprout, X } from 'lucide-react';

const categoryDetails = {
  packaging: { label: 'Упаковка', icon: Package },
  spices: { label: 'Специи и пряности', icon: Sprout },
  dairy: { label: 'Молочная', icon: Milk },
  frozen: { label: 'Заморозка', icon: Snowflake },
} satisfies Record<SupplierCategory, { label: string; icon: typeof Package }>;

interface SidebarProps {
  id: string;
  collapsed: boolean;
  status?: SupplierStatus;
  category?: SupplierCategory;
  facets: SuppliersListResponse['facets'] | null;
  selectedCount: number;
  onStatusChange: (status: SupplierStatus | undefined) => void;
  onCategoryChange: (category: SupplierCategory | undefined) => void;
  onCompare: () => void;
}

export function Sidebar({
  id,
  collapsed,
  status,
  category,
  facets,
  selectedCount,
  onStatusChange,
  onCategoryChange,
  onCompare,
}: SidebarProps) {
  const navItems: Array<{
    label: string;
    icon: typeof LayoutGrid;
    active: boolean;
    badge?: number;
    action: () => void;
  }> = [
    { label: 'Все поставщики', icon: LayoutGrid, active: status === undefined, action: () => onStatusChange(undefined) },
    { label: 'Шортлист', icon: Bookmark, active: status === 'shortlist', badge: facets?.statusCounts?.shortlist, action: () => onStatusChange('shortlist') },
    { label: 'Связались', icon: MessageCircle, active: status === 'contacted', badge: facets?.statusCounts?.contacted, action: () => onStatusChange('contacted') },
    { label: 'Отклонённые', icon: X, active: status === 'rejected', badge: facets?.statusCounts?.rejected, action: () => onStatusChange('rejected') },
  ];

  const totalByCategories = facets?.categories.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const hideInRail = collapsed ? 'lg:hidden' : '';
  const railItem = collapsed ? 'lg:justify-center lg:px-0 lg:h-9' : '';
  const activeNav = navItems.find(item => item.active) ?? navItems[0];
  const ActiveNavIcon = activeNav.icon;

  return (
    <aside id={id} className={`shrink-0 border-b border-line bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r lg:motion-safe:transition-[width] lg:motion-safe:duration-200 ease-out ${collapsed ? 'lg:w-15' : 'lg:w-[236px]'}`}>
      <div className={`flex h-shell-header shrink-0 items-center gap-2.5 border-b border-line px-4 ${collapsed ? 'lg:justify-center lg:px-0' : 'lg:px-5'}`}>
        <img src={import.meta.env.BASE_URL + 'foodsource.svg'} alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
        <span className={`whitespace-nowrap text-sm font-semibold tracking-tight text-ink ${hideInRail}`}>FoodSource</span>
      </div>

      <div className="flex flex-col lg:flex-1 lg:overflow-y-auto">
        <nav aria-label="Рабочие списки" className="px-4 py-2 lg:hidden">
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="flex h-9 w-full items-center gap-2 rounded-md border border-line bg-soft px-2.5 text-left text-xs font-semibold text-ink" aria-label={`Рабочий список: ${activeNav.label}`}>
                <ActiveNavIcon size={15} className="shrink-0 text-secondary" aria-hidden="true" />
                <span className="truncate">{activeNav.label}</span>
                {activeNav.badge !== undefined && <span className="num rounded bg-separator px-1.5 py-0.5 text-[10px] text-secondary">{activeNav.badge}</span>}
                <ChevronDown size={14} className="ml-auto shrink-0 text-secondary" aria-hidden="true" />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="start" sideOffset={5} collisionPadding={12} aria-label="Выбор рабочего списка" className="z-40 w-(--radix-popover-trigger-width) rounded-lg border border-line bg-white p-1 shadow-lg lg:hidden">
                {navItems.map(({ label, icon: Icon, badge, action }) => {
                  const isCurrent = activeNav.label === label;
                  return <Popover.Close asChild key={label}>
                    <button type="button" onClick={action} aria-pressed={isCurrent} className={`flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium ${isCurrent ? 'bg-brand-soft text-brand-ink-strong' : 'text-secondary hover:bg-soft'}`}>
                      <Icon size={14} className="shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {badge !== undefined && <span className="num rounded bg-separator px-1.5 py-0.5 text-[10px] text-secondary">{badge}</span>}
                      <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">{isCurrent && <Check size={14} />}</span>
                    </button>
                  </Popover.Close>;
                })}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </nav>

        <nav aria-label="Навигация по поставщикам" className={`hidden px-3 lg:block lg:py-4 ${collapsed ? 'lg:px-2' : 'lg:px-3'}`}>
          <p className={`eyebrow mb-2 hidden px-2.5 ${collapsed ? '' : 'lg:block'}`}>Пространство</p>
          {navItems.map(({ label, icon: Icon, active, badge, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              aria-pressed={active}
              aria-label={badge === undefined ? label : `${label}: ${badge}`}
              title={collapsed ? (badge === undefined ? label : `${label}: ${badge}`) : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors lg:mb-0.5 lg:w-full ${railItem} ${
                active ? 'bg-graphite font-medium text-white hover:bg-graphite-hover' : 'font-medium text-secondary hover:bg-canvas hover:text-ink'
              }`}
            >
              <Icon size={14} aria-hidden="true" className={`shrink-0 opacity-85 ${collapsed ? 'lg:size-4' : ''}`} />
              <span className={`truncate ${hideInRail}`}>{label}</span>
              {badge !== undefined && (
                <span aria-hidden="true" className={`num ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${hideInRail} ${active ? 'bg-white/15 text-white' : 'bg-separator text-secondary'}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}

          <div className="hidden py-2 lg:block">
            <div className="h-px bg-separator" />
          </div>

          <button
            type="button"
            onClick={onCompare}
            disabled={selectedCount < 2}
            title={selectedCount < 2 ? 'Сравнение: выберите от 2 до 4 поставщиков' : 'Открыть матрицу сравнения'}
            aria-label={`Сравнение: ${selectedCount} из 4`}
            className={`flex shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-secondary transition-colors hover:bg-canvas hover:text-ink lg:w-full ${railItem}`}
          >
            <GitCompareArrows size={14} aria-hidden="true" className={`shrink-0 opacity-85 ${collapsed ? 'lg:size-4' : ''}`} />
            <span className={hideInRail}>Сравнение</span>
            <span className={`num ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${hideInRail} ${selectedCount >= 2 ? 'bg-brand-soft text-brand-ink-strong' : 'bg-separator text-muted'}`}>
              {selectedCount}/4
            </span>
          </button>
        </nav>

        {facets && facets.categories.length > 0 && (
          <div role="group" aria-label="Категории" className={`hidden border-t border-separator py-4 lg:block ${collapsed ? 'px-2' : 'px-3'}`}>
            {!collapsed && <p className="eyebrow mb-2 px-2.5">Категории</p>}
            <div className="space-y-0.5">
              <button
                type="button"
                aria-pressed={!category}
                aria-label={collapsed ? 'Все категории' : undefined}
                title={collapsed ? `Все категории: ${totalByCategories}` : undefined}
                onClick={() => onCategoryChange(undefined)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${railItem} ${
                  !category ? 'bg-brand-soft font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-brand-line)]' : 'text-secondary hover:bg-soft hover:text-ink'
                }`}
              >
                {collapsed ? <Layers3 size={16} aria-hidden="true" /> : <><span className="flex items-center gap-2 whitespace-nowrap">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${!category ? 'bg-brand' : 'bg-line-strong'}`} />
                  Все категории
                </span>
                <span className="num text-[11px] text-muted">{totalByCategories}</span></>}
              </button>
              {facets.categories.map(item => {
                const isSelected = category === item.value;
                const { label, icon: CategoryIcon } = categoryDetails[item.value];
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={collapsed ? label : undefined}
                    title={collapsed ? `${label}: ${item.count}` : undefined}
                    onClick={() => onCategoryChange(isSelected ? undefined : item.value)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${railItem} ${
                      isSelected ? 'bg-brand-soft font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-brand-line)]' : 'text-secondary hover:bg-soft hover:text-ink'
                    }`}
                  >
                    {collapsed ? <CategoryIcon size={16} aria-hidden="true" /> : (
                      <>
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isSelected ? 'bg-brand' : 'bg-line-strong'}`} />
                          <span>{label}</span>
                        </span>
                        <span className="num shrink-0 text-[11px] text-muted">{item.count}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}