#!/usr/bin/env node
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = join(root, 'data', 'suppliers.seed.json');
const typesPath = join(root, 'shared', 'src', 'supplier.types.ts');
const skipHttp = process.argv.includes('--skip-http');
const raw = readFileSync(seedPath, 'utf8');
const suppliers = JSON.parse(raw);
const errors = [];
const warnings = [];
const categories = ['packaging', 'spices', 'dairy', 'frozen'];
const regions = new Set(['Москва', 'Москва и МО', 'Санкт-Петербург', 'Санкт-Петербург и ЛО', 'Вся РФ', 'Отдельные регионы РФ']);
const units = new Set(['RUB', 'KG', 'PCS', 'BOX']);
const systemNames = new Set(['ФГИС Меркурий', 'Честный ЗНАК', 'ХАССП', 'ЭДО']);
const placeholder = /123[-\s]45|000[-\s]00|example\.com/i;

if (!Array.isArray(suppliers)) throw new Error('JSON root must be an array');

// Compile the actual JSON as a TypeScript literal: JSON imports alone widen discriminant types.
const tempDir = mkdtempSync(join(tmpdir(), 'supplier-seed-check-'));
try {
  const file = join(tempDir, 'check.ts');
  writeFileSync(file, `import type { Supplier } from ${JSON.stringify(typesPath.replace(/\.ts$/, ''))};\nconst seed: Supplier[] = ${raw};\nvoid seed;\n`);
  try {
    execFileSync('npx', ['--no-install', 'tsc', '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2020', file], { cwd: root, stdio: 'pipe', timeout: 120000 });
    console.log('TypeScript: все записи соответствуют Supplier');
  } catch (error) {
    errors.push(`TypeScript: ${error.stderr?.toString() || error.stdout?.toString() || error.message}`);
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

for (const field of ['id', 'name', 'website']) {
  const seen = new Set();
  for (const row of suppliers) {
    const value = row[field];
    if (value === null && field === 'website') continue;
    const key = String(value).trim().toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) errors.push(`Дубликат ${field}: ${value}`);
    seen.add(key);
  }
}

for (const row of suppliers) {
  const id = row.id || '(без id)';
  if (!categories.includes(row.category)) errors.push(`${id}: неизвестная категория`);
  if (!Array.isArray(row.regions) || row.regions.some(x => !regions.has(x)) || new Set(row.regions).size !== row.regions.length) errors.push(`${id}: неизвестный или повторяющийся регион`);
  if (!row.sourceUrls?.includes(row.sourceUrl)) errors.push(`${id}: sourceUrls должен содержать sourceUrl`);
  if (new Set(row.sourceUrls).size !== row.sourceUrls.length) errors.push(`${id}: повторяющиеся sourceUrls`);
  if (row.documents?.some(x => systemNames.has(x))) errors.push(`${id}: система ошибочно указана как документ`);
  if (row.complianceSystems?.some(x => !systemNames.has(x))) errors.push(`${id}: неизвестная система или документ ошибочно указан как система`);
  if (row.moq?.unit !== null && !units.has(row.moq?.unit)) errors.push(`${id}: неизвестная единица MOQ`);
  if ((row.moq?.amount === null) !== (row.moq?.unit === null)) errors.push(`${id}: amount и unit MOQ должны быть оба заполнены либо оба null`);
  if (row.moq?.amount !== null && (!Number.isFinite(row.moq?.amount) || row.moq.amount <= 0)) errors.push(`${id}: MOQ должен быть положительным числом`);
  if (row.priceEstimate?.min !== null && row.priceEstimate?.max !== null && row.priceEstimate.min > row.priceEstimate.max) errors.push(`${id}: минимальная цена выше максимальной`);
  if (row.pros?.length < 2 || row.pros?.length > 3 || row.cons?.length < 1 || row.cons?.length > 2) errors.push(`${id}: ожидается 2–3 плюса и 1–2 ограничения`);
  if (row.defaultStatus !== 'new' || row.defaultNotes !== '') errors.push(`${id}: неверный статус или заметки по умолчанию`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.collectedAt) || Number.isNaN(Date.parse(row.collectedAt))) errors.push(`${id}: неверная дата сбора`);
  const contacts = Object.values(row.contacts ?? {}).filter(value => typeof value === 'string' && value.trim());
  if (!contacts.length) errors.push(`${id}: отсутствует контакт`);
  if (contacts.some(value => placeholder.test(value))) errors.push(`${id}: контакт содержит шаблонную заглушку`);
  if (row.contacts?.phone && row.contacts.phone.replace(/\D/g, '').length < 10) errors.push(`${id}: некорректный телефон`);
  if (row.contacts?.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.contacts.email)) errors.push(`${id}: некорректный email`);
  for (const url of [row.website, row.sourceUrl, ...(row.sourceUrls ?? [])].filter(Boolean)) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || placeholder.test(url)) throw new Error('invalid URL');
    } catch { errors.push(`${id}: некорректный URL ${url}`); }
  }
}

if (suppliers.length < 20 || suppliers.length > 24) errors.push('Ожидается от 20 до 24 поставщиков');

const count = (rows, predicate) => rows.filter(predicate).length;
console.log('\nКатегории:');
console.table(categories.map(category => {
  const rows = suppliers.filter(row => row.category === category);
  if (rows.length < 5 || rows.length > 6) errors.push(`${category}: ожидается 5–6 поставщиков`);
  return { category, total: rows.length, price: count(rows, row => row.priceEstimate.min !== null || row.priceEstimate.max !== null), moq: count(rows, row => row.moq.amount !== null), documents: count(rows, row => row.documents.length > 0), systems: count(rows, row => row.complianceSystems.length > 0) };
}));

console.log('\nПокрытие регионов (город без области не считается покрытием области):');
console.table(categories.map(category => {
  const rows = suppliers.filter(row => row.category === category);
  const moscow = count(rows, row => row.regions.includes('Москва и МО') || row.regions.includes('Вся РФ'));
  const spb = count(rows, row => row.regions.includes('Санкт-Петербург и ЛО') || row.regions.includes('Вся РФ'));
  if (moscow < 2 || spb < 2) errors.push(`${category}: недостаточное покрытие Москва/МО или СПб/ЛО`);
  return { category, 'Москва и МО': moscow, 'Санкт-Петербург и ЛО': spb, 'Вся РФ': count(rows, row => row.regions.includes('Вся РФ')) };
}));
console.log('\nРегионы:', [...new Set(suppliers.flatMap(row => row.regions))].sort().join(' | '));
console.log('Единицы MOQ:', [...new Set(suppliers.map(row => row.moq.unit))].map(x => x ?? 'null').sort().join(' | '));

if (skipHttp) {
  console.log('\nHTTP: проверка пропущена (--skip-http).');
} else {
const urls = [...new Set(suppliers.flatMap(row => [row.website, row.sourceUrl, ...row.sourceUrls]).filter(Boolean))];
const exec = promisify(execFile);
const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36';
async function request(url, head) {
  const args = ['-L', '-sS', '--max-time', '10', '-A', userAgent, '-o', '/dev/null', '-w', '%{http_code}', ...(head ? ['-I'] : ['--range', '0-0']), url];
  try {
    const { stdout } = await exec('curl', args, { timeout: 12000 });
    return { status: Number(stdout.slice(-3)), code: 0 };
  } catch (error) {
    return { status: Number(String(error.stdout || '').slice(-3)), code: Number(error.code) || -1, detail: String(error.stderr || error.message).trim() };
  }
}
async function checkUrl(url) {
  let result = await request(url, true);
  // Some sites do not implement HEAD, so confirm doubtful statuses with GET.
  if ([403, 404, 405, 501].includes(result.status) && !result.code) result = await request(url, false);
  return { url, ...result };
}
let next = 0;
const results = new Array(urls.length);
await Promise.all(Array.from({ length: Math.min(6, urls.length) }, async () => {
  for (;;) {
    const index = next++;
    if (index >= urls.length) break;
    results[index] = await checkUrl(urls[index]);
  }
}));
console.log(`\nHTTP: проверено уникальных URL: ${results.length}`);
for (const result of results) {
  if (result.code === 6 || result.status === 404) errors.push(`HTTP ${result.code === 6 ? 'DNS' : '404'}: ${result.url}`);
  else if (result.code || result.status === 403 || result.status === 429 || result.status >= 500 || result.status === 0) warnings.push(`HTTP ${result.status || 'нет ответа'}${result.code ? `, curl=${result.code}` : ''}: ${result.url}${result.detail ? ` (${result.detail})` : ''}`);
  else if (result.status >= 400) errors.push(`HTTP ${result.status}: ${result.url}`);
  else console.log(`  ${result.status} ${result.url}`);
}
}
console.log('\nПримечание: проверка контактов проверяет синтаксис и заглушки, но не доставляемость сообщений и не работоспособность телефона.');
if (warnings.length) console.warn('\nПредупреждения (антибот/сеть/временная ошибка):\n' + warnings.map(x => `  ${x}`).join('\n'));
if (errors.length) {
  console.error('\nОшибки:\n' + errors.map(x => `  ${x}`).join('\n'));
  process.exitCode = 1;
} else console.log('\nПроверка завершена без ошибок.');
