// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CompareResponse, SupplierDetailResponse, SupplierWithEvaluation, SuppliersListResponse } from '@food-suppliers/shared';
import { CatalogPage } from './CatalogPage';
import * as client from '../api/client';
import { useSupplierDetails } from '../api/useSupplierDetails';

vi.mock('../api/client', () => ({ fetchSuppliers: vi.fn(), fetchSupplierById: vi.fn(), updateSupplierWorkspace: vi.fn(), compareSuppliers: vi.fn() }));

function fixture(id: string, name: string): SupplierWithEvaluation {
  return {
    id, name, category: 'frozen', categoryLabel: 'Заморозка', description: 'Овощи оптом', city: 'Москва', regions: ['Вся РФ'],
    website: 'https://supplier.test', sourceUrl: 'https://supplier.test/source', sourceUrls: ['https://supplier.test/source'],
    contacts: { phone: '+7 495 000 01 01', email: 'mail@supplier.test', telegramOrWhatsapp: null },
    moq: { amount: 1000, unit: 'RUB', label: 'от 1 000 ₽' }, priceEstimate: { min: null, max: null, unit: null, label: 'По запросу' },
    pricingNote: null, documents: [], complianceSystems: [],
    delivery: { hasOwnDelivery: null, temperatureControlled: null, leadTime: null, terms: 'Уточнить' },
    pros: ['Ассортимент'], cons: ['Уточнить цену'], defaultStatus: 'new', defaultNotes: '', collectedAt: '2026-11-23',
    workspace: { status: 'new', notes: '', updatedAt: null },
    scoring: { total: 60, verdict: 'consider', verdictLabel: 'Хороший вариант', highlights: ['Есть доставка'], clarifications: ['Уточнить цену'], breakdown: [{ key: 'region', label: 'Регион', score: 20, maxScore: 30, detail: 'Покрытие' }] },
  };
}
const first = fixture('one', 'Первый поставщик');
const second = fixture('two', 'Второй поставщик');
const list: SuppliersListResponse = { items: [first, second], total: 2, facets: { categories: [{ value: 'frozen', label: 'Заморозка', count: 2 }], regions: ['Вся РФ'], statuses: ['new', 'shortlist', 'contacted', 'rejected'], statusCounts: { new: 2, shortlist: 0, contacted: 0, rejected: 0 } } };
const detail: SupplierDetailResponse = { ...first, rfqTemplate: { subject: 'Запрос КП', body: 'Здравствуйте!', checklist: ['Уточнить цену'] } };

const scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  vi.mocked(client.fetchSuppliers).mockResolvedValue(list);
  vi.mocked(client.fetchSupplierById).mockResolvedValue(detail);
});
afterEach(() => {
  cleanup();
  if (scrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  vi.clearAllMocks();
});

async function chooseFilter(user: ReturnType<typeof userEvent.setup>, label: string, name: string) {
  const panel = screen.getByRole('dialog', { name: 'Фильтры поставщиков' });
  within(panel).getByRole('combobox', { name: label }).focus();
  await user.keyboard('{Enter}');
  (await screen.findByRole('option', { name })).focus();
  await user.keyboard('{Enter}');
}

describe('Каталог поставщиков', () => {
  it('передаёт поиск с дебаунсом и выбранную категорию', async () => {
    const user = userEvent.setup(); render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    await user.type(screen.getByLabelText('Поиск'), 'овощи');
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'овощи' })));
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    await user.click(screen.getByRole('button', { name: /Заморозка: 2/ }));
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'frozen', search: 'овощи' })));
  });

  it('считает регион и дополнительные условия, не включая сортировку, статус и категорию', async () => {
    const user = userEvent.setup(); render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    expect(screen.queryByLabelText('Регион')).toBeNull();
    expect(screen.queryByLabelText('Сортировка')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Применённые фильтры' })).toBeNull();
    expect(screen.queryByLabelText(/Активных фильтров/)).toBeNull();
    const filtersButton = screen.getByRole('button', { name: 'Фильтры' });
    expect(filtersButton.compareDocumentPosition(screen.getByLabelText('Поиск')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.click(filtersButton);
    await chooseFilter(user, 'Регион', 'Вся РФ');
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ region: 'Вся РФ' })));
    expect(screen.getByLabelText('Активных фильтров: 1')).toBeTruthy();
    await chooseFilter(user, 'Сортировка', 'По мин. заказу');
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ region: 'Вся РФ', sortBy: 'moq_asc' })));
    await user.click(screen.getByRole('button', { name: /Заморозка: 2/ }));
    await chooseFilter(user, 'Статус работы', 'В шортлисте');
    expect(screen.getByLabelText('Активных фильтров: 1')).toBeTruthy();
    await user.click(screen.getByLabelText('Своя доставка'));
    expect(screen.getByLabelText('Активных фильтров: 2')).toBeTruthy();
    await user.type(screen.getByLabelText('Лимит на минимальный заказ, ₽'), '0');
    expect(screen.getByLabelText('Активных фильтров: 3')).toBeTruthy();
  });

  it('снимает температурный фильтр при выборе упаковки и объясняет ограничение', async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchSuppliers).mockResolvedValue({ ...list, facets: { ...list.facets, categories: [
      ...list.facets.categories, { value: 'packaging', label: 'Упаковка', count: 1 },
    ] } });
    render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    const panel = within(screen.getByRole('dialog', { name: 'Фильтры поставщиков' }));
    const cold = panel.getByRole<HTMLInputElement>('checkbox', { name: 'Подтверждён температурный режим' });
    await user.click(cold);
    expect(cold.checked).toBe(true);
    await user.click(panel.getByRole('button', { name: 'Упаковка: 1' }));
    expect(cold.checked).toBe(false);
    expect(cold.disabled).toBe(true);
    expect(panel.getByText(/только для молочной продукции и заморозки/)).toBeTruthy();
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'packaging', temperatureControlled: undefined })));
  });

  it('позволяет убрать условия по одному и очистить поиск, не сбрасывая регион', async () => {
    const user = userEvent.setup(); render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    const search = screen.getByLabelText('Поиск') as HTMLInputElement;
    await user.type(search, 'овощи');
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'овощи' })));

    const filters = screen.getByRole('button', { name: 'Фильтры' });
    await user.click(filters);
    await chooseFilter(user, 'Регион', 'Вся РФ');
    await user.click(screen.getByLabelText('Своя доставка'));
    await user.click(screen.getByRole('button', { name: /до 25\s000 ₽/ }));
    await user.click(screen.getByLabelText('Включать поставщиков без известного минимума в рублях'));
    await user.keyboard('{Escape}');
    expect(filters.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(filters);
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({
      region: 'Вся РФ', hasOwnDelivery: true, maxMoqRub: 25000, includeUnknownMoq: false,
    })));

    const chips = screen.getByRole('list', { name: 'Применённые фильтры' });
    expect(search.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const removeRegion = within(chips).getByRole('button', { name: 'Удалить фильтр: Регион: Вся РФ' });
    await user.click(within(chips).getByRole('button', { name: /Удалить фильтр: MOQ до 25\s000 ₽/ }));
    expect(within(chips).getByRole('button', { name: 'Удалить фильтр: Своя доставка' })).toBeTruthy();
    expect(screen.getByLabelText('Активных фильтров: 2')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Очистить поиск' }));
    expect(search.value).toBe('');
    expect(document.activeElement).toBe(search);
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({
      search: undefined, region: 'Вся РФ', hasOwnDelivery: true, maxMoqRub: undefined, includeUnknownMoq: undefined,
    })));
    await user.click(removeRegion);
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ region: undefined, hasOwnDelivery: true })));
    expect(screen.getByLabelText('Активных фильтров: 1')).toBeTruthy();
  });

  it('разделяет ассортимент и минимальный заказ, не выводя цену товара в реестре', async () => {
    const user = userEvent.setup();
    const moqLabel = 'Доставка по Москве и МО от 1 короба';
    const priceLabel = 'Креветки 90/120 королевские, 400 г — 365 ₽/упаковка';
    const items: SupplierWithEvaluation[] = [
      { ...first, assortmentGroups: ['Креветки', 'Мидии', 'Кальмары', 'Гребешки'], moq: { amount: 1, unit: 'BOX', label: moqLabel }, priceEstimate: { min: 365, max: 365, unit: 'RUB/упаковка', label: priceLabel } },
      { ...second, moq: { amount: null, unit: null, label: 'Минимальный заказ от 0,5 кг одной позиции' } },
      { ...fixture('three', 'Третий поставщик'), moq: { amount: null, unit: null, label: 'Условия различаются: от 500 кг или от 5 тонн' }, priceEstimate: { min: null, max: 270, unit: 'RUB/кг', label: 'Лук-порей — до 270 ₽/кг' } },
    ];
    vi.mocked(client.fetchSuppliers).mockResolvedValue({ ...list, items, total: items.length });
    render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    const table = within(screen.getByRole('region', { name: 'Таблица поставщиков' }));
    expect(table.getAllByRole('columnheader').slice(2, 4).map(header => header.textContent)).toEqual(['Ассортимент', 'Мин. заказ']);
    expect(table.getAllByText('Позиции не собраны')).toHaveLength(2);
    expect(screen.getByTitle(moqLabel).textContent).toBe('от 1 кор.');
    expect(screen.getByTitle(items[1].moq.label).textContent).toBe('от 0,5 кг');
    expect(screen.getByTitle(items[2].moq.label).textContent).toBe('По запросу');
    expect(table.queryByTitle(priceLabel)).toBeNull();
    expect(table.queryByText(/365 ₽/)).toBeNull();
    expect(screen.getByTitle('Выберите до 4 поставщиков для сравнения')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сравнить Первый поставщик' }).getAttribute('title')).toBe('Добавить к сравнению');
    await user.click(table.getByRole('button', { name: /Креветки · Мидии · Кальмары.*ещё групп: 1/ }));
    expect((await screen.findByRole('tab', { name: 'Ассортимент' })).getAttribute('aria-selected')).toBe('true');
  });

  it('показывает только покрытие и ставит подтверждённый регион из фильтра первым', async () => {
    const user = userEvent.setup();
    const nationwide: SupplierWithEvaluation = {
      ...first,
      regions: ['Вся РФ', 'Москва и МО'],
      delivery: { ...first.delivery, hasOwnDelivery: true, temperatureControlled: true, leadTime: 'Завтра' },
    };
    const regional: SupplierWithEvaluation = { ...second, regions: ['Санкт-Петербург и ЛО', 'Отдельные регионы РФ', 'Москва'] };
    vi.mocked(client.fetchSuppliers).mockResolvedValue({ ...list, items: [nationwide, regional], facets: {
      ...list.facets, regions: ['Вся РФ', 'Москва', 'Москва и МО', 'Санкт-Петербург и ЛО'],
    } });
    render(<CatalogPage />);
    const table = within(screen.getByRole('region', { name: 'Таблица поставщиков' }));
    const column = table.getAllByRole('columnheader').findIndex(header => header.textContent === 'Куда доставляют');
    const deliveryCell = (name: string) => within(table.getByRole('row', { name: `Открыть карточку поставщика ${name}` })).getAllByRole('cell')[column];
    await screen.findByText(first.name);
    expect(deliveryCell(first.name).textContent).toBe('Вся РФ');
    expect(within(deliveryCell(second.name)).getByTitle('Москва')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Фильтры' }));
    await chooseFilter(user, 'Регион', 'Москва');
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ region: 'Москва' })));
    expect(Array.from(deliveryCell(first.name).firstElementChild?.children ?? [], tag => tag.textContent)).toEqual(['Москва и МО', 'Вся РФ']);
    expect(deliveryCell(second.name).firstElementChild?.firstElementChild?.textContent).toBe('Москва');
    expect(within(deliveryCell(second.name)).getByTitle('Отдельные регионы РФ')).toBeTruthy();
    await chooseFilter(user, 'Регион', 'Вся РФ');
    expect(deliveryCell(first.name).textContent).toBe('Вся РФ');
  });

  it('синхронизирует сравнение из дровера с таблицей и соблюдает общий лимит', async () => {
    const user = userEvent.setup();
    const items = [first, second, ...[3, 4, 5].map(n => fixture(String(n), 'Поставщик ' + n))];
    vi.mocked(client.fetchSuppliers).mockResolvedValue({ ...list, items, total: items.length });
    render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    const row = screen.getByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' });
    await user.click(row);
    let dialog = screen.getByRole('dialog');
    const add = await within(dialog).findByRole('button', { name: 'Сравнить' });
    expect(document.activeElement).toBe(dialog);
    await user.click(add);
    expect(within(dialog).getByRole('button', { name: 'В сравнении' }).getAttribute('aria-pressed')).toBe('true');
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть карточку' }));
    expect(within(row).getByRole('button', { name: 'Убрать Первый поставщик из сравнения' }).getAttribute('title')).toBe('Убрать из сравнения');
    await user.click(row);
    dialog = screen.getByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'В сравнении' }));
    await user.keyboard('{Escape}');
    expect(within(row).getByRole('button', { name: 'Сравнить Первый поставщик' })).toBeTruthy();
    for (const item of items.slice(1)) await user.click(screen.getByRole('button', { name: 'Сравнить ' + item.name }));
    await user.click(row);
    const atLimit = await within(screen.getByRole('dialog')).findByRole('button', { name: 'Сравнить' });
    expect((atLimit as HTMLButtonElement).disabled).toBe(true);
    expect(atLimit.getAttribute('title')).toMatch(/не более 4/);
  });

  it('открывает строку с клавиатуры, не открывая её при выборе для сравнения', async () => {
    const user = userEvent.setup(); render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    await user.click(screen.getByRole('button', { name: 'Сравнить Первый поставщик' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const row = screen.getByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' });
    row.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Как рассчитан скоринг');
    const contacts = within(dialog).getByRole('region', { name: 'Контакты и источники' });
    expect(within(contacts).getByRole('link', { name: 'Официальный сайт' })).toBeTruthy();
    expect(within(contacts).getByRole('link', { name: 'supplier.test/source' })).toBeTruthy();
    expect(within(dialog).getByRole('region', { name: 'Заказ' }).compareDocumentPosition(within(dialog).getByText('Как рассчитан скоринг')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(contacts.compareDocumentPosition(within(dialog).getByText('Как рассчитан скоринг')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(dialog).getAllByText('Уточнить цену')).toHaveLength(1);
    const delivery = within(within(dialog).getByRole('region', { name: 'Доставка' }));
    expect(delivery.getByText('Температурный режим не подтверждён')).toBeTruthy();
    expect(delivery.getByText('Срок уточняется.')).toBeTruthy();
  });

  it('показывает заказ, доставку и документы отдельно, раскрывая пояснение к цене по клику', async () => {
    const user = userEvent.setup();
    const priceEstimate = { min: 100, max: 100, unit: 'RUB', label: 'Короб — 100 ₽' };
    const pricingNote = 'Условия первого заказа отличаются от повторных.';
    const terms = 'Бесплатная доставка от 30 000 ₽.';
    vi.mocked(client.fetchSupplierById).mockResolvedValue({
      ...detail, category: 'packaging', priceEstimate, pricingNote, complianceSystems: ['Честный ЗНАК'],
      delivery: { ...detail.delivery, leadTime: 'На следующий день', terms },
    });
    render(<CatalogPage />);
    await user.click(await screen.findByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' }));
    const dialog = within(await screen.findByRole('dialog'));
    const order = within(await dialog.findByRole('region', { name: 'Заказ' }));
    const disclosure = order.getByText('Пример цены и примечание');
    const details = disclosure.closest('details');
    expect(details?.open).toBe(false);
    expect(order.queryByText('Оптовая цена — по запросу.')).toBeNull();
    await user.click(disclosure);
    expect(details?.open).toBe(true);
    expect(order.getByText(priceEstimate.label)).toBeTruthy();
    expect(order.getByText(pricingNote)).toBeTruthy();
    const delivery = within(dialog.getByRole('region', { name: 'Доставка' }));
    expect(delivery.getByText(terms)).toBeTruthy();
    expect(delivery.queryByText(/Температурный режим/)).toBeNull();
    const documents = within(dialog.getByRole('region', { name: 'Документы' }));
    expect(documents.getByText('На сайте не указаны.')).toBeTruthy();
    expect(documents.getByText('Честный ЗНАК')).toBeTruthy();
  });

  it('переключает открытую карточку по строке, но не сбрасывает несохранённую заметку', async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchSupplierById).mockImplementation(async id => ({ ...detail, ...(id === 'two' ? second : first) }));
    render(<CatalogPage />);
    const firstRow = await screen.findByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' });
    const secondRow = screen.getByRole('row', { name: 'Открыть карточку поставщика Второй поставщик' });
    await user.click(firstRow);
    const dialog = screen.getByRole('dialog');
    await within(dialog).findByRole('tab', { name: 'Заметки' });
    await user.click(secondRow);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(secondRow.getAttribute('aria-current')).toBe('true');
    expect(firstRow.getAttribute('aria-current')).toBeNull();
    await user.click(await within(dialog).findByRole('tab', { name: 'Заметки' }));
    const notes = within(dialog).getByRole<HTMLTextAreaElement>('textbox', { name: 'Заметки менеджера' });
    await user.type(notes, 'Черновик');
    await user.click(firstRow);
    expect(notes.value).toBe('Черновик');
    expect(secondRow.getAttribute('aria-current')).toBe('true');
    expect(within(dialog).getByText(/Сохраните или отмените изменения/)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Отменить изменения' }));
    await user.click(firstRow);
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(firstRow.getAttribute('aria-current')).toBe('true');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(firstRow);
  });

  it('переключает поставщиков стрелками, не переводя фокус на крестик', async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchSupplierById).mockImplementation(async id => ({ ...detail, ...(id === 'two' ? second : first) }));
    render(<CatalogPage />);
    await user.click(await screen.findByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' }));
    const dialog = screen.getByRole('dialog');
    const close = within(dialog).getByRole('button', { name: 'Закрыть карточку' });
    expect(document.activeElement).toBe(dialog);
    await user.keyboard('{ArrowDown}');
    await within(dialog).findByRole('heading', { name: 'Второй поставщик' });
    expect(document.activeElement).toBe(dialog);
    await user.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Предыдущий поставщик' }));
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(close);
    await user.keyboard('{ArrowUp}');
    await within(dialog).findByRole('heading', { name: 'Первый поставщик' });
    expect(document.activeElement).toBe(dialog);
  });

  it('сразу показывает знакомую карточку при возврате и повторном открытии', async () => {
    const user = userEvent.setup();
    let finishRefresh!: (response: SupplierDetailResponse) => void;
    const refresh = new Promise<SupplierDetailResponse>(resolve => { finishRefresh = resolve; });
    const fetchDetail = vi.mocked(client.fetchSupplierById);
    fetchDetail.mockResolvedValueOnce(detail).mockResolvedValueOnce({ ...detail, ...second }).mockReturnValue(refresh);
    render(<CatalogPage />);
    const firstRow = await screen.findByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' });
    await user.click(firstRow);
    const drawer = within(screen.getByRole('dialog'));
    await drawer.findByText('Как рассчитан скоринг');
    await user.keyboard('{ArrowDown}');
    await drawer.findByRole('combobox', { name: 'Статус для Второй поставщик' });
    await user.keyboard('{ArrowUp}');
    expect(drawer.getByText('Как рассчитан скоринг')).toBeTruthy();
    expect(drawer.queryByText('Загружаем карточку...')).toBeNull();
    expect(fetchDetail).toHaveBeenCalledTimes(3);

    await user.keyboard('{Escape}');
    await user.click(firstRow);
    expect(within(screen.getByRole('dialog')).getByText('Как рассчитан скоринг')).toBeTruthy();
    expect(fetchDetail).toHaveBeenCalledTimes(3);
    await act(async () => { finishRefresh({ ...detail, description: 'Обновлённое описание' }); });
    expect(within(screen.getByRole('dialog')).getByText('Обновлённое описание')).toBeTruthy();
  });

  it('разделяет кэш по региону и MOQ, не затирая сохранённую заметку старым ответом', async () => {
    let finishRefresh!: (response: SupplierDetailResponse) => void;
    const refresh = new Promise<SupplierDetailResponse>(resolve => { finishRefresh = resolve; });
    const fetchDetail = vi.mocked(client.fetchSupplierById);
    fetchDetail
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce({ ...detail, scoring: { ...detail.scoring, total: 80 } })
      .mockResolvedValueOnce({ ...detail, scoring: { ...detail.scoring, total: 77 } })
      .mockReturnValueOnce(refresh)
      .mockRejectedValueOnce(new Error('Нет сети'));
    const unfiltered = { region: undefined, maxMoqRub: undefined };
    const moscow = { ...unfiltered, region: 'Москва и МО' };
    const capped = { ...moscow, maxMoqRub: 1000 };
    const { result, rerender } = renderHook(
      ({ region, maxMoqRub }: { region?: string; maxMoqRub?: number }) => useSupplierDetails('one', region, maxMoqRub),
      { initialProps: unfiltered as { region?: string; maxMoqRub?: number } },
    );
    await waitFor(() => expect(result.current.detail?.scoring.total).toBe(60));
    rerender(moscow);
    expect(result.current.detail).toBeNull();
    await waitFor(() => expect(result.current.detail?.scoring.total).toBe(80));
    rerender(capped);
    expect(result.current.detail).toBeNull();
    await waitFor(() => expect(result.current.detail?.scoring.total).toBe(77));
    rerender(moscow);
    expect(result.current.detail?.scoring.total).toBe(80);
    act(() => result.current.updateWorkspace('one', { ...first.workspace, status: 'shortlist', notes: 'Позвонить' }));
    await act(async () => { finishRefresh({ ...detail, scoring: { ...detail.scoring, total: 81 } }); });
    expect(result.current.detail?.scoring.total).toBe(81);
    expect(result.current.detail?.workspace).toMatchObject({ status: 'shortlist', notes: 'Позвонить' });
    await act(async () => { rerender(capped); });
    expect(result.current.detail?.scoring.total).toBe(77);
    expect(result.current.detail?.workspace.notes).toBe('Позвонить');
    expect(result.current.loadError).toBeUndefined();
  });

  it('переключает рабочие списки в сайдбаре', async () => {
    const user = userEvent.setup(); render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    const nav = screen.getByRole('navigation', { name: 'Навигация по поставщикам' });
    await user.click(within(nav).getByRole('button', { name: /^Шортлист/ }));
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'shortlist' })));
    await user.click(within(nav).getByRole('button', { name: /^Связались/ }));
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'contacted' })));
    await user.click(within(nav).getByRole('button', { name: 'Все поставщики' }));
    await waitFor(() => expect(client.fetchSuppliers).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined })));
  });

  it('открывает найденную позицию в ассортименте и добавляет её с фасовкой в письмо', async () => {
    const user = userEvent.setup();
    const product = { id: 'cream', name: 'Сливки 33%', pack: '1 л', price: { kind: 'on_request' as const }, sourceUrl: 'https://supplier.test/cream', checkedAt: '2026-11-24' };
    vi.mocked(client.fetchSuppliers).mockResolvedValue({ ...list, items: [{ ...first, assortmentGroups: ['Молоко и сливки'], matchedProducts: [product] }, second] });
    vi.mocked(client.fetchSupplierById).mockResolvedValue({ ...detail, assortment: { catalogUrl: 'https://supplier.test/catalog', groups: ['Сливки'], products: [product] } });
    render(<CatalogPage />);
    const match = await screen.findByRole('button', { name: 'Найдено: Сливки 33% 1 л' });
    expect(match.closest('td')?.cellIndex).toBe(2);
    await user.click(match);
    const drawer = within(await screen.findByRole('dialog'));
    expect((await drawer.findByRole('tab', { name: 'Ассортимент' })).getAttribute('aria-selected')).toBe('true');
    const table = await drawer.findByRole('table', { name: '' });
    expect(within(table).getByText('По запросу')).toBeTruthy();
    expect(within(table).getByRole('link', { name: 'Товар' }).getAttribute('href')).toBe(product.sourceUrl);
    await user.click(within(table).getByRole('button', { name: 'В запрос КП: Сливки 33%' }));
    expect(drawer.getByRole('tab', { name: /Запрос КП/ }).getAttribute('aria-selected')).toBe('true');
    expect(decodeURIComponent(drawer.getByRole('link', { name: 'Написать письмо' }).getAttribute('href') ?? '')).toContain('Сливки 33% — 1 л');
    await user.click(drawer.getByRole('button', { name: 'Убрать из запроса: Сливки 33%' }));
    expect(decodeURIComponent(drawer.getByRole('link', { name: 'Написать письмо' }).getAttribute('href') ?? '')).not.toContain('Сливки 33%');
  });

  it('сохраняет заметку без изменения статуса и показывает индикатор', async () => {
    const user = userEvent.setup();
    vi.mocked(client.updateSupplierWorkspace).mockResolvedValue({ ...detail, workspace: { status: 'contacted', notes: 'Позвонить', updatedAt: '2026-11-23T10:00:00Z' } });
    render(<CatalogPage />); await screen.findByText('Первый поставщик');
    await user.click(screen.getByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Как рассчитан скоринг');
    const notesTab = within(dialog).getByRole('tab', { name: 'Заметки' });
    await user.click(notesTab);
    expect(within(dialog).getAllByRole('combobox')).toHaveLength(1);
    expect(notesTab.getAttribute('aria-description')).toBeNull();
    await user.type(within(dialog).getByLabelText('Заметки менеджера'), 'Позвонить');
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить изменения' }));
    await waitFor(() => expect(client.updateSupplierWorkspace).toHaveBeenCalledWith('one', { notes: 'Позвонить' }));
    expect(within(dialog).getByText('Сохранено')).toBeTruthy();
    expect(notesTab.getAttribute('aria-description')).toBe('Есть сохранённая заметка');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('оставляет шапку таблицы в пустом шортлисте и сохраняет общие счётчики статусов', async () => {
    const user = userEvent.setup();
    const facets = { ...list.facets, statusCounts: { new: 1, shortlist: 0, contacted: 1, rejected: 0 } };
    vi.mocked(client.fetchSuppliers).mockImplementation(async query => query?.status === 'shortlist'
      ? { items: [], total: 0, facets }
      : { ...list, facets });
    render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    const nav = screen.getByRole('navigation', { name: 'Навигация по поставщикам' });
    const table = screen.getByRole('table');
    await user.click(within(nav).getByRole('button', { name: /^Шортлист/ }));
    await within(table).findByText('В шортлисте пока никого нет');
    expect(within(table).getByRole('columnheader', { name: 'Поставщик' })).toBeTruthy();
    expect(within(table).getByRole('columnheader', { name: 'Статус' })).toBeTruthy();
    expect(within(table).queryByRole('row', { name: /Открыть карточку/ })).toBeNull();
    expect(within(nav).getByRole('button', { name: /Связались: 1/ })).toBeTruthy();
    expect(within(table).queryByRole('button')).toBeNull();
    await user.click(within(nav).getByRole('button', { name: 'Все поставщики' }));
    await screen.findByText('Первый поставщик');
  });

  it('открывает карточку упаковки по клику и сохраняет статус из шапки без перезаписи заметки', async () => {
    const user = userEvent.setup();
    const packaging = { ...first, category: 'packaging', categoryLabel: 'Упаковка', delivery: { ...first.delivery, temperatureControlled: true } } as const;
    const packagingDetail = { ...detail, ...packaging };
    vi.mocked(client.fetchSuppliers).mockResolvedValue({ ...list, items: [packaging], total: 1 });
    vi.mocked(client.fetchSupplierById).mockResolvedValue(packagingDetail);
    vi.mocked(client.updateSupplierWorkspace).mockResolvedValue({ ...packagingDetail, workspace: { ...packaging.workspace, status: 'shortlist' } });
    render(<CatalogPage />);
    await screen.findByText('Первый поставщик');
    expect(screen.queryByTitle('Подтверждён температурный режим')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Режим отображения' })).toBeNull();
    const table = screen.getByRole('region', { name: 'Таблица поставщиков' });
    await user.click(within(table).getByRole('button', { name: 'Сравнить Первый поставщик' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(within(table).getByRole('row', { name: 'Открыть карточку поставщика Первый поставщик' }));
    const dialog = await screen.findByRole('dialog');
    const status = await within(dialog).findByLabelText('Статус для Первый поставщик');
    expect(within(dialog).queryByText('Температурный режим')).toBeNull();
    status.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(screen.queryByRole('listbox')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(status));
    await user.keyboard('{ArrowDown}');
    (await screen.findByRole('option', { name: 'В шортлисте' })).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(client.updateSupplierWorkspace).toHaveBeenCalledWith('one', { status: 'shortlist' }));
    await waitFor(() => expect(status.textContent).toBe('В шортлисте'));
  });

  it('обновляет сравнение при удалении колонки, скрывает одинаковые условия и открывает КП лидера', async () => {
    const user = userEvent.setup();
    const third = fixture('three', 'Третий поставщик');
    const suppliers = [first, second, third];
    vi.mocked(client.fetchSuppliers).mockResolvedValue({ ...list, items: suppliers, total: 3 });
    vi.mocked(client.compareSuppliers).mockImplementation(async ({ ids }) => ({
      suppliers: suppliers.filter(s => ids.includes(s.id)),
      winnerId: 'one', winnerReason: 'Максимальный скоринг',
      rows: [
        { key: 'score', label: 'Итоговый скоринг', values: { one: '60 / 100', two: '60 / 100', three: '60 / 100' }, bestSupplierIds: ['one'] },
        { key: 'delivery', label: 'Доставка и сроки', values: { one: 'Своя доставка: да', two: 'Своя доставка: нет', three: 'Своя доставка: нет' }, bestSupplierIds: ['one'] },
        { key: 'pricingNote', label: 'Примечание к условиям', values: { one: 'На короб', two: 'На короб', three: 'За штуку' }, bestSupplierIds: [] },
        { key: 'regions', label: 'Регионы доставки', values: { one: 'Вся РФ', two: 'Вся РФ', three: 'Вся РФ' }, bestSupplierIds: [] },
        { key: 'moq', label: 'Минимальный заказ (MOQ)', values: { one: '1000 ₽', two: '2000 ₽', three: '3000 ₽' }, bestSupplierIds: ['one'] },
      ],
    } satisfies CompareResponse));
    render(<CatalogPage />); await screen.findByText('Первый поставщик');
    for (const supplier of suppliers) await user.click(screen.getByRole('button', { name: 'Сравнить ' + supplier.name }));
    await user.click(screen.getByRole('button', { name: /Сравнить \(3\)/ }));
    const dialog = await screen.findByRole('dialog');
    const modal = within(dialog);
    await modal.findByText('Максимальный скоринг');
    expect(client.compareSuppliers).toHaveBeenCalledWith({ ids: ['one', 'two', 'three'], region: undefined, maxMoqRub: undefined });
    expect(modal.getAllByText('Лучшее')).toHaveLength(2);
    expect(modal.getAllByRole('rowheader').map(header => header.textContent)).toEqual(['Регионы доставки', 'Минимальный заказ (MOQ)', 'Доставка и сроки', 'Примечание к условиям']);
    expect(modal.getByText('Своя доставка', { exact: true })).toBeTruthy();
    const different = modal.getByRole('switch', { name: 'Только различия' });
    await user.click(different);
    expect(modal.queryByRole('rowheader', { name: 'Регионы доставки' })).toBeNull();
    expect(modal.getByRole('rowheader', { name: 'Примечание к условиям' })).toBeTruthy();
    await user.click(modal.getByRole('button', { name: 'Убрать из сравнения: Третий поставщик' }));
    const remove = await modal.findByRole<HTMLButtonElement>('button', { name: 'Убрать из сравнения: Первый поставщик' });
    expect(remove.disabled).toBe(true);
    expect(client.compareSuppliers).toHaveBeenLastCalledWith({ ids: ['one', 'two'], region: undefined, maxMoqRub: undefined });
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(modal.queryByRole('rowheader', { name: 'Примечание к условиям' })).toBeNull();
    expect(modal.getByRole('rowheader', { name: 'Минимальный заказ (MOQ)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сравнить Третий поставщик' })).toBeTruthy();

    await user.click(modal.getByRole('button', { name: 'Перейти к КП' }));
    const drawer = within(await screen.findByRole('dialog', { name: 'Первый поставщик' }));
    expect((await drawer.findByRole('tab', { name: /Запрос КП/ })).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('dialog', { name: 'Сравнение поставщиков' })).toBeNull();
    expect(client.fetchSupplierById).toHaveBeenCalledWith('one', { region: undefined, maxMoqRub: undefined });
  });
});
