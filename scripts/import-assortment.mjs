import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';

const { JSDOM } = createRequire(new URL('../frontend/package.json', import.meta.url))('jsdom');
const curl = promisify(execFile);
const checkedAt = process.env.ASSORTMENT_CHECKED_AT ?? new Date().toISOString().slice(0, 10);
const onlyUmpuls = process.argv.includes('--umpuls');
const umpulsId = 'sup-frozen-02';
const target = new URL('../backend/src/suppliers/assortment.snapshot.json', import.meta.url);
const seed = JSON.parse(await readFile(new URL('../data/suppliers.seed.json', import.meta.url), 'utf8'));
const pages = new Map();

const clean = value => (value ?? '').replace(/[\u200b-\u200d]/gu, '').replace(/\s+/gu, ' ').trim();
const number = value => {
  const raw = clean(String(value ?? '')).replace(/\s/gu, '').replace(',', '.');
  return /^\d+(?:\.\d+)?$/u.test(raw) && Number(raw) > 0 ? Number(raw) : null;
};
const published = (amount, unit = null) => amount === null ? { kind: 'not_published' } : { kind: 'published', amount, unit };
const onRequest = { kind: 'on_request' };
const text = (node, selector) => clean(node?.querySelector(selector)?.textContent);
const rubles = value => number(value.match(/([\d][\d ,.]*?)\s*(?:₽|руб\.)/u)?.[1]);
const packFrom = name => clean([...name.matchAll(/\d+(?:[.,]\d+)?\s*(?:кг|гр\.?|г|мл|л|шт\.?)(?=[\s,.;)]|$)/giu)].at(-1)?.[0]).replace(/(?<=\d)(?=\p{L})/gu, ' ') || null;
const documents = new Map();
const lanes = Array.from({ length: 8 }, () => Promise.resolve());
const contents = url => {
  if (!pages.has(url)) {
    const lane = pages.size % lanes.length;
    const request = lanes[lane].then(() => curl('curl', ['-fsSL', '--max-time', '22', '--retry', '1', '--max-filesize', '8000000', '-A', 'Mozilla/5.0', url], { maxBuffer: 8e6 }).then(({ stdout }) => stdout));
    pages.set(url, request);
    lanes[lane] = request.then(() => {}, () => {});
  }
  return pages.get(url);
};
const doc = url => {
  if (!documents.has(url)) documents.set(url, contents(url).then(html => new JSDOM(html, { url }).window.document));
  return documents.get(url);
};

const row = (name, sourceUrl, extra = {}) => {
  name = clean(name);
  if (!name || !sourceUrl.startsWith('https://')) throw new Error(`Invalid position: ${name} / ${sourceUrl}`);
  const { id, pack = null, price = { kind: 'not_published' }, ...metadata } = extra;
  const key = [sourceUrl, metadata.sourceKind === 'listing' ? name : '', pack ?? ''].join('\n');
  return { id: id ?? createHash('sha256').update(key).digest('hex').slice(0, 16), name, pack, price, sourceUrl, checkedAt, ...metadata };
};
const listing = (name, url, extra) => row(name, url, { sourceKind: 'listing', ...extra });
const fromLinks = async (url, selector, extract = () => ({}), limit = Infinity) => {
  const document = await doc(url);
  const positions = new Map();
  for (const link of document.querySelectorAll(selector)) {
    const name = clean(link.textContent) || clean(link.getAttribute('title'));
    const metadata = extract(link, name);
    if (!metadata || !name || !link.href || positions.has(link.href)) continue;
    const { nameOverride, ...fields } = metadata;
    positions.set(link.href, row(nameOverride ?? name, link.href, fields));
    if (positions.size >= limit) break;
  }
  if (!positions.size) throw new Error(`No product links found: ${url} (${selector})`);
  return [...positions.values()];
};
const collect = async (id, url, groups, sources, catalogNote) => {
  const [, ...chunks] = await Promise.all([doc(url), ...sources]);
  const products = [...new Map(chunks.flat().map(item => [item.id, item])).values()];
  if (!products.length) throw new Error(`No positions found for ${id}`);
  return [id, { catalogUrl: url, groups, products, ...(catalogNote ? { catalogNote } : {}) }];
};

const rona = 'https://ronapack.ru';
const ronaPages = [
  '/catalog/00_rona_sobstvennoe_proizvodstvo/00_01_vakuumnye_pakety/00_01_01_pakety_vakuumnye_55_mkm/',
  '/catalog/02_pishchevaya_upakovka/02_01_konteynery/02_01_04_konteynery_dlya_sousa/',
  '/catalog/01_odnorazovaya_posuda/01_01_stakany_plastikovye_bumazhnye_vps_chashki/01_01_02_bumazhnye_stakany_i_akssesuary/',
  '/catalog/03_upakovochnye_materialy/03_01_plenka/03_01_01_plenka_pishchevaya_pe/',
];
const ipg = 'https://ipg-upakovka.ru';
const unipak = 'https://unipakspb.ru';
const ptl = 'https://ptllc.ru';
const par = 'https://www.mosparitet.ru/catalog/odnorazovaya-upakovka';
const fresh = 'https://freshfield.ru/opt/price';
const hor = 'https://www.horazm.ru';
const gur = 'https://gurmadze.ru';
const zarya = 'https://td-zarya.ru/catalog/pripravy_i_specii/';
const paprika = 'https://spetsii-optom.ru/catalog';
const vost = 'https://vosttorg.ru';
const agropark = 'https://agroparkspb.ru/molochnaya-produktsiya';
const rs = 'https://rs-line.ru';
const milco = 'https://milco.group/molochnye-produkty-optom';
const kalin = 'https://kalinbaza.ru/moloko';
const fst = 'https://fs-trade.ru/shop/';
const ump = 'https://umpuls.ru';
const afina = 'https://www.afinafrozen.ru/';
const agro = 'https://postavkaoptom.ru/';
const edan = 'https://edanfood.ru/#catalog';
const prem = 'https://pr-ice.ru';

const milkList = (url, limit) => fromLinks(url, '.products__item-title', (a, name) => ({
  pack: packFrom(name), price: published(rubles(text(a.closest('.products__item'), '.products__item-price'))),
}), limit);

const freshList = async () => {
  const csv = await contents(fresh + '.csv');
  return csv.trim().split(/\r?\n/u).slice(1).flatMap(line => {
    const fields = [...line.matchAll(/"((?:[^"]|"")*)"(?:;|$)/gu)].map(match => match[1].replaceAll('""', '"'));
    if (fields.length !== 6 || !/^\d{4}-\d{2}-\d{2}$/u.test(fields[0])) throw new Error('Unexpected Freshfield CSV format');
    const [date, , name, weight, bulk, one] = fields;
    return [[number(weight) ? `Мешок ${weight} кг` : null, bulk], ['Пакет 1 кг', one]]
      .filter(([pack, amount]) => pack && number(amount) !== null)
      .map(([pack, amount]) => listing(name, fresh, { pack, price: published(number(amount), 'кг'), priceNote: `Оптовый прайс от ${date}` }));
  });
};

const tildaList = async (part, rec) => {
  const response = JSON.parse(await contents(`https://store.tildaapi.com/api/getproductslist/?storepartuid=${part}&recid=${rec}&getparts=true&getoptions=true&size=100`));
  if (response.products?.length !== response.total || !response.products?.length) throw new Error('Incomplete Paprika-Korica section');
  return response.products.flatMap(product => {
    if (new URL(product.url).hostname !== 'spetsii-optom.ru') throw new Error('Unexpected Paprika-Korica product domain');
    const editions = (product.editions ?? []).filter(edition => clean(edition['Вес']));
    return editions.length ? editions.map(edition => row(product.title, product.url, {
      pack: clean(edition['Вес']).replace(/(?<=\d)\.(?=\d)/gu, ','), price: published(number(edition.price), 'уп.'),
    })) : [row(product.title, product.url)];
  });
};

// Retain stable IDs for the pilot products used in links, selection, and tests.
const legacy = new Map([
  ['slivki-amanda-33-1l-jpg', ['amanda-33-1l', 'Сливки ультрапастеризованные Amanda 33%', '1 л', 'шт.']],
  ['maslo-slivochnoe-povarskoe-82-5-5kg', ['povarskoe-825-5kg', 'Масло сливочное «Поварское» 82,5% ГОСТ', 'Монолит 5 кг', 'кг']],
  ['sguschennoe-celnoe-moloko-8-5-rmkk-belarus-korobka-20kg', ['rogachev-85-20kg', 'Сгущённое молоко «Рогачёв» 8,5%', 'Коробка 20 кг', 'кг']],
  ['adygeyskiy-syr-45-vak-up-molzavod-novyy-300-g', ['adygeysky-45-300g']],
  ['altayskiy-kudesnik-syr-50-brus-kholod-altayskiy-kudesnik', ['altaysky-50']],
  ['slivki-barista-line-33-1-l', ['barista-line-33-1l']],
  ['slivki-milkavita-33-0-5-l', ['milkavita-33-05l']],
  ['kombinirovannye-slivki-creamart-33-1-l', ['creamart-33-1l']],
]);
const stable = url => legacy.get(new URL(url).pathname.split('/').filter(Boolean).at(-1)) ?? [];
const vostProduct = async slug => {
  const url = `${vost}/${slug}/`;
  const page = await doc(url);
  const [id, name, pack, unit] = stable(url);
  const amount = rubles(text(page, '.ty-price'));
  if (!amount) throw new Error(`Cannot verify published price on ${url}`);
  const unavailable = /нет в наличии/iu.test(text(page, '.ty-qty-out-of-stock'));
  return row(name, url, { id, pack, price: published(amount, unit), ...(unavailable ? { availabilityNote: 'На дату проверки на сайте: нет в наличии' } : {}) });
};
const vostList = slug => fromLinks(`${vost}/${slug}/`, 'a.product-title', (a, name) => {
  if (stable(a.href).length) return null;
  return { pack: packFrom(name), price: published(rubles(text(a.closest('.ut2-gl__item'), '.ty-price'))) };
}, 10);

const umpulsProduct = async ({ id, name, sourceUrl }) => {
  const page = await doc(sourceUrl);
  const priceBox = page.querySelector('.buybox__price');
  if (!priceBox) throw new Error('Missing Umpuls product price block: ' + sourceUrl);
  const detail = text(priceBox, 'i');
  const match = detail.match(/^(?:за\s+|\/\s*)(кг|шт\.?|уп\.?)\s*(?:·|$)/iu);
  const unit = match ? ({ 'кг': 'кг', 'шт': 'шт.', 'уп': 'уп.' }[match[1].toLowerCase().replace(/\.$/u, '')]) : null;
  const priceNote = /цена зависит от объ[её]ма/iu.test(detail) ? 'Цена зависит от объёма' : null;
  const underOrder = /под заказ/iu.test(clean(priceBox.textContent));
  const variants = [...page.querySelectorAll('.packs__list .pack[data-pack]')];
  const packLabel = variant => clean(variant?.dataset.pack).replace(/(кг|г|л)\.$/u, '$1');
  const byPack = Map.groupBy(variants, packLabel);
  return (variants.length ? variants : [null]).map((variant, index) => {
    const size = packLabel(variant);
    const variantLabel = byPack.get(size)?.length > 1 ? text(variant, 'small') : '';
    const pack = [size, variantLabel].filter(Boolean).join(' · ') || null;
    const amount = variant?.hasAttribute('data-price') ? number(variant.dataset.price)
      : variants.length < 2 ? rubles(text(priceBox, 'b')) : null;
    const price = underOrder || (amount === null && variant?.dataset.price === '0') ? onRequest : published(amount, unit);
    return row(name, sourceUrl, {
      id: index === 0 ? id : undefined, pack, price,
      ...(priceNote && price.kind === 'published' ? { priceNote } : {}),
      ...(underOrder ? { availabilityNote: 'На сайте: под заказ' } : {}),
    });
  });
};

const collectUmpuls = () => collect(umpulsId, ump + '/shop', ['Замороженные овощи', 'Ягоды и фрукты', 'Грибы', 'Зелень'], [
  Promise.all(['ovoshchi', 'yagody', 'frukty', 'griby', 'zelen'].map(path => fromLinks(ump + '/shop/' + path, '.pcard__title')))
    .then(sections => [...new Map(sections.flat().map(product => [product.sourceUrl, product])).values()])
    .then(products => Promise.all(products.map(umpulsProduct))).then(variants => variants.flat()),
]);

const jobs = onlyUmpuls ? [collectUmpuls()] : [
  collect('sup-pack-01', `${rona}/catalog/`, ['Вакуумные пакеты', 'Одноразовая посуда', 'Пищевые контейнеры', 'Пищевая плёнка', 'Столовые приборы'], ronaPages.map(path => fromLinks(rona + path, '.item-title a', a => ({
    price: published(number(text(a.closest('.item_info'), '.price_value'))),
  }), 12))),
  collect('sup-pack-02', `${unipak}/catalog`, ['Вакуумные пакеты', 'Пищевая плёнка', 'Лотки под запайку', 'Гофротара', 'Этикетки'], [Promise.all([
    [`${unipak}/vakuumnie-paketi-optom`, '100х200 мм', 'Вакуумный пакет ПЭТ/ПЭ, 100 × 200 мм, 65 мкм'],
    [`${unipak}/vakuumnie-paketi-pa-pe`, 'Пакеты', 'Вакуумные пакеты ПА/ПЭ'],
    [`${unipak}/pishhevaya-plenka`, '15 мкм', 'Пищевая полиэтиленовая плёнка, 300 мм, 15 мкм'],
    [`${unipak}/lotki`, 'лотки из вспененного полистирола', 'Лотки из вспененного полистирола'],
    [`${unipak}/lotki`, 'под запайку', 'Пищевые лотки под запайку'],
  ].map(async ([url, marker, name]) => {
    if (!clean((await doc(url)).body.textContent).includes(marker)) throw new Error(`Missing offer in ${url}: ${marker}`);
    return listing(name, url);
  }))], 'На сайте описаны материалы и типовые изделия. Артикулы, размеры партии и цены уточняйте у поставщика.'),
  collect('sup-pack-03', `${ipg}/katalog`, ['Пищевые контейнеры', 'Упаковка для тортов', 'Стаканы и крышки', 'Упаковка для суши', 'Столовые приборы', 'Бумажные контейнеры', 'Коробки для пиццы'], [
    ['universalnye-konteynery', 'Контейнер'], ['upakovka-dlya-tortov', 'Упаковка для торта'],
    ['odnorazovye-stakanchiki', ''], ['upakovka-dlya-sushi', ''], ['stolovye-pribory-i-nabory', ''], ['bumazhnye-konteynery', ''],
  ].map(([path, prefix]) => fromLinks(`${ipg}/${path}/`, '.product-card h3 a', (_a, name) => ({ nameOverride: prefix ? `${prefix} ${name}` : name }), 12))),
  collect('sup-pack-04', `${ptl}/catalogn/`, ['Бумажные стаканы и крышки', 'Ланч-боксы', 'Супницы и салатники', 'Коробки WOK', 'Тарелки', 'Упаковка для фастфуда'], [
    'bumazhnye-stakany-perenoski-kryshki', 'korobki-pod-konditerskie-izdeliya-lanch-boksy-konteynery-s-oknom', 'supnitsy-salatniki', 'korobki-pod-lapshu-wok-kruglye-kvadratnye', 'tarelki', 'upakovka-dlya-fastfuda-burgery-popkorn-pitstsa',
  ].map(group => fromLinks(`${ptl}/catalogn/`, `a[href^="/catalogn/${group}/"]`, a => a.pathname.split('/').filter(Boolean).length === 3 ? {} : null, 12))),
  collect('sup-pack-05', par, ['Вспененные подложки', 'Контейнеры и крышки', 'Одноразовая посуда', 'Пакеты и плёнка'], [
    fromLinks(par, '.about a', a => {
      const card = a.closest('.info')?.parentElement;
      const amount = rubles(clean(card?.textContent));
      return { price: published(amount), ...(/Наличие:\s*Ожидается/u.test(clean(card?.textContent)) ? { availabilityNote: 'На дату проверки на сайте: ожидается' } : {}) };
    }),
  ]),
  collect('sup-spice-01', fresh, ['Весовые специи и пряности', 'Смеси пряностей', 'Сушёные овощи и зелень'], [freshList()]),
  collect('sup-spice-02', `${hor}/katalog/`, ['Сушёные овощи', 'Специи и приправы', 'Сухофрукты и орехи'], [
    fromLinks(`${hor}/katalog/`, 'a[href*="/katalog/"]', a => a.protocol === 'https:' && a.pathname.split('/').filter(Boolean).length === 3 ? {} : null),
  ]),
  collect('sup-spice-03', `${gur}/opt`, ['Грузинские специи', 'Смеси приправ', 'Сванская соль', 'Аджика'], [
    fromLinks(`${gur}/catalog/spices`, 'a[href*="/catalog/spices/"]', (a, name) => {
      if (/\/dlya_/u.test(a.href)) return null;
      return name.length > 80 ? null : { price: onRequest, sourceKind: 'listing' };
    }),
    Promise.resolve(['Уцхо-сунели', 'Кондари', 'Сванская соль', 'Аджика'].map(name => listing(name, `${gur}/opt`, { price: onRequest }))),
  ], 'Приведены позиции из оптового предложения. Розничную цену с сайта не считаем оптовой.'),
  collect('sup-spice-04', zarya, ['Молотые и цельные специи', 'Смеси приправ', 'Пищевые добавки'], [
    fromLinks(zarya, '[itemtype$="/Product"] .name a', (a, name) => ({ pack: packFrom(name), price: published(number(a.closest('[itemtype$="/Product"]')?.querySelector('[itemprop="price"]')?.getAttribute('content'))) })),
  ]),
  collect('sup-spice-05', paprika, ['Молотые специи', 'Цельные специи', 'Смеси специй'], [tildaList('360863059862', '834079038'), tildaList('603385351932', '834079039')]),
  collect('sup-dairy-01', `${vost}/moloko-slivki/`, ['Молоко и сливки', 'Сливочное масло и спреды', 'Сыры', 'Сгущённое молоко'], [
    ...['slivki-amanda-33-1l-jpg', 'maslo-slivochnoe-povarskoe-82-5-5kg', 'sguschennoe-celnoe-moloko-8-5-rmkk-belarus-korobka-20kg'].map(vostProduct),
    ...['moloko-slivki', 'syry', 'slivochnoe-maslo'].map(vostList),
  ]),
  collect('sup-dairy-02', agropark, ['Сыры', 'Сливочное масло, маргарин и спреды', 'Йогурты и творог', 'Молоко и сливки'], [
    milkList(agropark, 45).then(products => products.map(p => ({ ...p, id: stable(p.sourceUrl)[0] ?? p.id }))),
    milkList(`${agropark}/maslo-slivochnoe-margarin-spred`, 24),
  ]),
  collect('sup-dairy-03', `${rs}/katalog-produkcii`, ['Сливки', 'Молоко', 'Сливочное масло', 'Сыры'], [
    ...['slivki', 'moloko-slivki', 'slivochnoe-maslo'].map(path => fromLinks(`${rs}/katalog/${path}`, `main a[href^="/katalog/${path}/"]`, (a, name) => ({ id: stable(a.href)[0], pack: packFrom(name), price: onRequest }))),
  ]),
  collect('sup-dairy-04', milco, ['Сливочное масло', 'Полутвёрдые сыры', 'Спреды'], [Promise.resolve([
    ['Масло сливочное 72,5%', '200 г'], ['Масло сливочное El Primero 82,5%', '180 г'], ['Сыр Голландский полутвёрдый', null],
    ['Сыр Российский полутвёрдый', null], ['Сыр Альпийский', '200 г'], ['Сыр Тильзитер', null],
  ].map(([name, pack]) => listing(name, milco, { pack, price: onRequest })))], 'Выборка из открытой страницы производителя; подробное коммерческое предложение предоставляется по заявке.'),
  collect('sup-dairy-05', kalin, ['Молоко', 'Сыры', 'Сливочное масло', 'Творог и сметана', 'Йогурты'], [milkList(kalin, 60)]),
  collect('sup-frozen-01', fst, ['Замороженные ягоды и фрукты', 'Овощи и овощные смеси', 'Грибы'], [
    ...['yagodi', 'ovoshi_i_smesi', 'gribi'].map(path => fromLinks(`${fst}${path}/`, 'li[data-price] .title > a[href]', (a, _name) => ({
      nameOverride: text(a, '.name'), price: published(number(a.closest('li[data-price]')?.dataset.price)),
    }))),
  ]),
  collectUmpuls(),
  collect('sup-frozen-03', `${afina}#catalog`, ['Замороженные ягоды', 'Фрукты', 'Овощи'], [
    fromLinks(afina, '#catalog a', (a, name) => ({ nameOverride: `${name} (заморозка)`, price: onRequest })),
  ]),
  collect('sup-frozen-04', `${agro}catalog/`, ['Замороженные овощи', 'Ягоды', 'Грибы', 'Овощные смеси', 'Картофель фри', 'Морепродукты'], [
    fromLinks(agro, 'li.level4 > a[href^="catalog/"]', (a, name) => a.pathname.endsWith('/') || name.startsWith('Посмотреть') ? null : {}),
  ]),
  collect('sup-frozen-05', edan, ['Замороженные ягоды', 'Овощи и смеси', 'Кукуруза', 'Сыр', 'Морепродукты', 'Бакалея'], [Promise.resolve([
    'Малина замороженная', 'Черника замороженная', 'Клубника замороженная', 'Смородина замороженная', 'Ягодная смесь замороженная',
    'Кукуруза замороженная в початках', 'Кукуруза замороженная в зерне',
  ].map(name => listing(name, edan, { price: onRequest })))], 'Сайт перечисляет продукты по категориям; артикулы, фасовки и цены отдельных позиций — в прайсе по запросу. Рекламную цену «от» не привязываем к товару.'),
  collect('sup-frozen-06', `${prem}/zamorozka-optom`, ['Морепродукты и рыба', 'Овощи и смеси', 'Вареники и сырники', 'Пельмени', 'Готовые блюда', 'Мороженое'], [
    ...['moreprodukty', 'ovoshchi', 'vareniki'].map(path => fromLinks(`${prem}/catalog/${path}`, `.product-copy h3 a[href^="/catalog/${path}/"]`, (a, name) => {
      const main = a.closest('.product-copy')?.querySelector('.purchase-primary');
      const unit = { 'за шт.': 'шт.', 'за кг': 'кг', 'за уп.': 'уп.' }[text(main, 'span')] ?? null;
      return { pack: packFrom(name), price: published(rubles(text(main, 'strong')), unit) };
    })),
  ]),
];

const results = await Promise.allSettled(jobs);
const failure = results.filter(result => result.status === 'rejected');
if (failure.length) {
  for (const result of failure) console.error(result.reason.message);
  throw new Error('Snapshot not written: one or more sources could not be verified.');
}
const refreshed = Object.fromEntries(results.map(result => result.value));
const snapshot = onlyUmpuls ? { ...JSON.parse(await readFile(target, 'utf8')), ...refreshed } : refreshed;
if (seed.length !== Object.keys(snapshot).length || seed.some(supplier => !snapshot[supplier.id])) throw new Error('Supplier coverage does not match the seed');
console.table(seed.filter(({ id }) => !onlyUmpuls || id === umpulsId).map(({ id, name }) => ({ name, groups: snapshot[id].groups.length, positions: snapshot[id].products.length, priced: snapshot[id].products.filter(p => p.price.kind === 'published').length })));
if (process.argv.includes('--write')) await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
