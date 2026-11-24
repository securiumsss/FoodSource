import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createPostgresPool } from '../backend/dist/storage/postgres-storage.js';

const seed = JSON.parse(readFileSync(new URL('../data/suppliers.seed.json', import.meta.url), 'utf8'));
config({ path: new URL('../.env', import.meta.url) });
const args = process.argv.slice(2);
const sqlitePath = args.length === 2 && args[0] === '--from-sqlite' ? args[1] : undefined;
if (args.length && !sqlitePath) throw new Error('Usage: npm run db:migrate -- [--from-sqlite path/to/app.db]');
const url = (process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL)?.trim();
if (!url) throw new Error('Configure DATABASE_MIGRATION_URL or DATABASE_URL before migrating');

const workspace = new Map();
if (sqlitePath) {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(resolve(sqlitePath), { readonly: true, fileMustExist: true });
  try {
    const columns = db.pragma('table_info(supplier_workspace)');
    const timestamp = columns.some(column => column.name === 'updated_at') ? 'updated_at' : 'NULL AS updated_at';
    for (const row of db.prepare('SELECT supplier_id, status, notes, ' + timestamp + ' FROM supplier_workspace').all()) {
      workspace.set(row.supplier_id, row);
    }
  } finally {
    db.close();
  }
}

const pool = createPostgresPool(url);
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(readFileSync(new URL('../data/postgres-schema.sql', import.meta.url), 'utf8'));
    let imported = 0;
    for (const supplier of seed) {
      const local = workspace.get(supplier.id);
      await client.query('INSERT INTO foodsource.suppliers (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [supplier.id, supplier]);
      // Only replace an untouched default row. Reimports never overwrite edits made in Postgres.
      const result = await client.query(
        'INSERT INTO foodsource.supplier_workspace (supplier_id, status, notes, updated_at) VALUES ($1, $2, $3, $4) ' +
        'ON CONFLICT (supplier_id) DO UPDATE SET status = EXCLUDED.status, notes = EXCLUDED.notes, updated_at = EXCLUDED.updated_at ' +
        'WHERE $5 AND supplier_workspace.status = $6 AND supplier_workspace.notes = $7 AND supplier_workspace.updated_at IS NULL',
        [supplier.id, local?.status ?? supplier.defaultStatus, local?.notes ?? supplier.defaultNotes,
          local?.updated_at ?? null, Boolean(local), supplier.defaultStatus, supplier.defaultNotes],
      );
      if (result.rowCount && local && (local.updated_at || local.status !== supplier.defaultStatus || local.notes !== supplier.defaultNotes)) imported++;
    }
    await client.query('COMMIT');
    console.log('Suppliers verified in PostgreSQL: %d; SQLite workspace changes imported: %d', seed.length, imported);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
