import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import type { Supplier } from '@food-suppliers/shared';

/** Paths are anchored to the backend package, not the caller's working directory. */
export const backendRoot = resolve(__dirname, '../..');
export const projectRoot = resolve(backendRoot, '..');

export function initializeDatabase(databasePath: string, seedPath: string): Database.Database {
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);

  try {
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS supplier_workspace (
        supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id),
        status TEXT NOT NULL DEFAULT 'new',
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT
      );
    `);

    const workspaceColumns = db.pragma('table_info(supplier_workspace)') as { name: string }[];
    if (!workspaceColumns.some(column => column.name === 'updated_at')) {
      db.exec('ALTER TABLE supplier_workspace ADD COLUMN updated_at TEXT');
    }

    const suppliers: Supplier[] = JSON.parse(readFileSync(seedPath, 'utf8'));
    if (!Array.isArray(suppliers)) throw new Error('Supplier seed must be an array');
    const insertSupplier = db.prepare('INSERT INTO suppliers (id, data) VALUES (?, ?) ON CONFLICT(id) DO NOTHING');
    const insertWorkspace = db.prepare('INSERT INTO supplier_workspace (supplier_id, status, notes) VALUES (?, ?, ?) ON CONFLICT(supplier_id) DO NOTHING');

    db.transaction(() => {
      for (const supplier of suppliers) {
        insertSupplier.run(supplier.id, JSON.stringify(supplier));
        insertWorkspace.run(supplier.id, supplier.defaultStatus, supplier.defaultNotes);
      }
    })();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
