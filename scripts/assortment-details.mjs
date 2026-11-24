const clean = value => (value ?? '').replace(/[\u200b-\u200d]/gu, '').replace(/\s+/gu, ' ').trim();
const text = (node, selector) => clean(node?.querySelector(selector)?.textContent);
const positive = value => {
  const raw = clean(value).replace(/ /gu, '').replace(',', '.');
  return /^\d+(?:\.\d+)?$/u.test(raw) && Number(raw) > 0 ? Number(raw) : null;
};
const amountPattern = '(\\d+(?: \\d{3})*(?:[.,]\\d+)?)';
const rublePattern = '(?:₽|руб(?:\\.|лей)?|[Рр])';
const amountOf = value => positive(value.match(new RegExp(`${amountPattern}\\s*${rublePattern}(?![а-яё])`, 'iu'))?.[1]);
const unitOf = value => ({ кг: 'кг', г: 'г', шт: 'шт.', уп: 'уп.', упак: 'уп.', л: 'л', м: 'м', 'пог. м': 'пог. м', т: 'т', рул: 'рул.', рулон: 'рулон', короб: 'короб' })[clean(value).toLowerCase().replace(/\.$/u, '')] ?? null;
const unitPattern = '(кг|г|шт\\.?|упак\\.?|уп\\.?|л|пог\\. м|м|т|рулон|рул\\.?|короб)';
const explicitUnit = value => unitOf(value.match(new RegExp(`^(?:/\\s*|за\\s+(?:1\\s+)?)${unitPattern}(?:$|[ ,;()])`, 'iu'))?.[1]);
const quantity = value => /\d/u.test(value) && value.length <= 120 && !/уточня|запрос/u.test(value.toLowerCase()) ? value : null;
const weightPack = value => quantity(value)?.replace(/(\d\s*)гр\.*(?=\s|$)/iu, '$1г');
const pieces = value => {
  const match = clean(value).match(/^([\d ]+)(?:\s*(?:шт\.?|штук[аи]?))?$/iu);
  const amount = positive(match?.[1]);
  return amount ? `${new Intl.NumberFormat('ru-RU').format(amount)} шт.` : null;
};
const attributes = (root, rows, label, value) => new Map([...root.querySelectorAll(rows)]
  .map(line => [text(line, label).replace(/\s*:\s*$/u, '').toLowerCase(), text(line, value)])
  .filter(([key, entry]) => key && entry));
const priceAt = (value, unit) => ({ amount: amountOf(value), unit });

const extract = {
  'sup-pack-01': root => {
    const main = root.querySelector('.prices_block .price');
    const fields = attributes(root, '.props_list tr', 'td:first-child', 'td:nth-child(2)');
    const alternate = [...root.querySelectorAll('.js-catalog-detail-hide-params-1')].map(el => clean(el.textContent))
      .map(value => value.match(/^Количество в упаковке:?\s+(.+)$/iu)?.[1]).find(Boolean);
    const count = pieces(fields.get('штук в упаковке') ?? alternate);
    return { pack: count && `Упаковка: ${count}`, price: priceAt(clean(main?.textContent), explicitUnit(text(main, '.price_measure'))) };
  },
  'sup-pack-03': root => {
    const fields = attributes(root, '.tab-panel tr', 'td:first-child', 'td:nth-child(2)');
    const count = pieces(fields.get('количество в коробке'));
    return { pack: count && `Короб: ${count}` };
  },
  'sup-pack-04': root => {
    const fields = attributes(root, '.props_list tr, .props_table tr', 'td:first-child', 'td:nth-child(2)');
    const count = pieces(fields.get('количество в коробке') ?? fields.get('штук в коробке'));
    const inPack = pieces(fields.get('количество в упаковке') ?? fields.get('штук в упаковке'));
    return { pack: count ? `Короб: ${count}` : inPack ? `Упаковка: ${inPack}` : null };
  },
  'sup-pack-05': root => {
    const main = root.querySelector('.unit_info');
    const value = clean(main?.textContent);
    const minimum = pieces(value.match(/Мин\.\s*заказ:\s*([\d ]+\s*шт\.?)/iu)?.[1]);
    return {
      price: priceAt(text(main, '.price'), unitOf(value.match(/Кол-во:\s*(шт\.?|кг|уп\.?)(?![а-яё])/iu)?.[1])),
      priceNote: minimum && `Мин. заказ этой позиции: ${minimum}`,
    };
  },
  'sup-spice-02': root => {
    const fields = attributes(root, 'table.props tr', 'td:first-child, th', 'td:last-child');
    const tiers = [...root.querySelectorAll('.offerSchema .prices .price')].map(el => {
      const match = clean(el.textContent).match(new RegExp(`^Цена от (\\d+(?:[.,]\\d+)?)\\s*(кг|т):?\\s*${amountPattern}\\s*${rublePattern}\\s*/\\s*${unitPattern}$`, 'iu'));
      if (!match) return null;
      const [, minimum, measure, rawAmount, rawUnit] = match;
      return { minimum, measure, kg: positive(minimum) * (measure === 'т' ? 1000 : 1), amount: positive(rawAmount), unit: unitOf(rawUnit) };
    }).filter(tier => tier?.amount && tier.kg && tier.unit).sort((a, b) => a.kg - b.kg);
    const format = new Intl.NumberFormat('ru-RU');
    return {
      pack: quantity(fields.get('фасовка') ?? ''),
      price: tiers[0], allowNewPrice: true,
      priceNote: tiers.length ? `${tiers.map(({ minimum, measure, amount, unit }) => `от ${minimum} ${measure} — ${format.format(amount)} ₽/${unit}`).join('; ')}.`.replace(/^от/u, 'От') : null,
    };
  },
  'sup-spice-04': root => ({ price: priceAt(text(root, '.big-buy-btn span.price'), unitOf(text(root, '.big-buy-btn .measurement-unit .active'))) }),
  'sup-dairy-01': root => {
    const price = text(root, '.ty-product-block .ty-product-prices');
    const suffix = price.match(new RegExp(`${amountPattern}\\s*${rublePattern}\\s*([^]*?)$`, 'iu'))?.[2] ?? '';
    const fields = attributes(root, '.ty-product-feature', '.ut2-product-feature__label__name', '.ty-product-feature__value, .ut2-product-feature__value');
    return { pack: quantity(fields.get('фасовка') ?? ''), price: priceAt(price, explicitUnit(suffix)) };
  },
  'sup-dairy-02': root => {
    const spec = [...root.querySelectorAll('.sku__details-shortdescription li')].map(el => clean(el.textContent))
      .map(value => value.match(/^(?:Фасовка|Вес|Объ[её]м)\s*:\s*(.+)$/iu)?.[1]).find(Boolean);
    const price = text(root, '.sku__price');
    const suffix = price.match(new RegExp(`${amountPattern}\\s*${rublePattern}\\s*([^]*?)$`, 'iu'))?.[2] ?? '';
    return { pack: weightPack(spec ?? ''), price: priceAt(price, explicitUnit(suffix)) };
  },
  'sup-dairy-03': root => {
    const spec = [...root.querySelectorAll('.shop-product-data__desc p')].map(el => clean(el.textContent))
      .map(value => value.match(/^(?:Вес (?:пачки|упаковки|короба)|Фасовка)\s*:\s*([^;]+)$/iu)?.[1]).find(Boolean);
    return { pack: weightPack(spec ?? '') };
  },
  'sup-dairy-05': root => {
    const tier = root.querySelector('.kb-bp-tier');
    return { price: priceAt(clean(tier?.textContent), explicitUnit(text(tier, '.kb-bp-tier-left b'))) };
  },
  'sup-frozen-01': root => {
    const labels = [...root.querySelectorAll('#product .options-row label')];
    const selected = labels.find(label => label.querySelector('input[checked]')) ?? (labels.length === 1 ? labels[0] : null);
    const unit = clean(selected?.textContent).match(/^Цена\s+(.*)$/iu)?.[1];
    return { price: priceAt(text(root, '#product .prices .new'), explicitUnit(unit ?? '')) };
  },
  'sup-frozen-04': root => {
    const fields = attributes(root, 'main .attributes__row', 'dt', 'dd');
    for (const label of root.querySelectorAll('.info__list dt')) {
      if (label.nextElementSibling?.matches('dd')) fields.set(clean(label.textContent).toLowerCase(), clean(label.nextElementSibling.textContent));
    }
    const value = fields.get('вес упаковки') ?? '';
    const weight = /\d\s*(?:кг|г(?:р\.)?|л|мл)(?:$|[\s.,])/iu.test(value) ? weightPack(value) : null;
    const kind = fields.get('вид упаковки');
    return {
      pack: weight ? (kind && /^(?:короб(?:ка)?|мешок|пакет|контейнер|ведро)$/iu.test(kind) ? `${kind} ${weight}` : weight) : null,
      onRequest: /^по запросу\.?$/iu.test(fields.get('цена за единицу') ?? ''),
    };
  },
  'sup-frozen-06': root => {
    const fields = attributes(root, '.product-facts > div', 'dt', 'dd');
    return { pack: weightPack(fields.get('количество в коробе') ?? '') };
  },
};

export const needsProductDetails = (supplierId, product) => Boolean(extract[supplierId]) && product.sourceKind !== 'listing' &&
  (!product.pack || (product.price.kind === 'published' && !product.price.unit) ||
    (supplierId === 'sup-spice-02' && product.price.kind === 'not_published') ||
    (supplierId === 'sup-pack-05' && !product.priceNote));

export const withProductDetails = (supplierId, product, document, checkedAt) => {
  if (!needsProductDetails(supplierId, product)) return product;
  const { pack, price, priceNote, allowNewPrice, onRequest } = extract[supplierId](document);
  const update = {};
  if (!product.pack && pack) update.pack = pack;
  if (price?.unit && price.amount && (
    (allowNewPrice && product.price.kind === 'not_published') ||
    (product.price.kind === 'published' && !product.price.unit && product.price.amount === price.amount)
  )) update.price = { kind: 'published', amount: price.amount, unit: price.unit };
  if (onRequest && product.price.kind === 'not_published') update.price = { kind: 'on_request' };
  if (priceNote && !product.priceNote && (!allowNewPrice || update.price)) update.priceNote = priceNote;
  return Object.keys(update).length ? { ...product, ...update, checkedAt } : product;
};

export const isHorazmProductUrl = pathname => /^\/katalog\/(?!page\/)[^/]+\/[^/]+\/?$/u.test(pathname);

export const applyReferencePacks = (snapshot, { ptl, milco }) => {
  const printed = new Map(ptl.products.map(([id, , count, page]) => [id, { count, page }]));
  const dairy = new Map(milco.products.map(([id, pack, sourceUrl]) => [id, { pack, sourceUrl }]));
  let updated = 0;
  snapshot['sup-pack-04'].products = snapshot['sup-pack-04'].products.map(product => {
    const ref = printed.get(product.id);
    if (product.pack || !ref) return product;
    updated++;
    return {
      ...product, pack: `Короб: ${pieces(String(ref.count))}`,
      sourceUrl: `${ptl.pdfUrl}#page=${ref.page}`, checkedAt: ptl.checkedAt, sourceKind: 'listing',
    };
  });
  snapshot['sup-dairy-04'].products = snapshot['sup-dairy-04'].products.map(product => {
    const ref = dairy.get(product.id);
    if (product.pack || !ref) return product;
    const { sourceKind: _listing, ...rest } = product;
    updated++;
    return { ...rest, ...ref, checkedAt: milco.checkedAt };
  });
  return updated;
};
