import { isAbsolute, resolve } from 'node:path';
import type Database from 'better-sqlite3';
import type { Supplier, SupplierStatus, WorkspaceUpdateDto } from '@food-suppliers/shared';
import { backendRoot, initializeDatabase, projectRoot } from './database';

import type { StoredSupplier } from './storage.service';

interface StoredRow {
  data: string;
  status: SupplierStatus;
  notes: string;
  updated_at: string | null;
}

function toStoredSupplier(row: StoredRow): StoredSupplier {
  return {
    supplier: JSON.parse(row.data) as Supplier,
    workspace: { status: row.status, notes: row.notes, updatedAt: row.updated_at },
  };
}

export class SqliteStorage {
  private readonly db: Database.Database;

  constructor() {
    const configuredPath = process.env.DATABASE_PATH;
    const databasePath = configuredPath
      ? isAbsolute(configuredPath) ? configuredPath : resolve(backendRoot, configuredPath)
      : resolve(projectRoot, 'data/app.db');
    this.db = initializeDatabase(databasePath, resolve(projectRoot, 'data/suppliers.seed.json'));
  }

  listWithWorkspace(): StoredSupplier[] {
    const rows = this.db.prepare(`
      SELECT s.data, w.status, w.notes, w.updated_at
      FROM suppliers s JOIN supplier_workspace w ON w.supplier_id = s.id ORDER BY s.rowid
    `).all() as StoredRow[];
    return rows.map(toStoredSupplier);
  }

  findWithWorkspace(id: string): StoredSupplier | undefined {
    const row = this.db.prepare(`
      SELECT s.data, w.status, w.notes, w.updated_at
      FROM suppliers s JOIN supplier_workspace w ON w.supplier_id = s.id WHERE s.id = ?
    `).get(id) as StoredRow | undefined;
    return row ? toStoredSupplier(row) : undefined;
  }

  updateWorkspace(id: string, update: WorkspaceUpdateDto): StoredSupplier | undefined {
    return this.db.transaction(() => {
      const result = this.db.prepare(`
        UPDATE supplier_workspace
        SET status = COALESCE(?, status), notes = COALESCE(?, notes), updated_at = ?
        WHERE supplier_id = ?
      `).run(update.status ?? null, update.notes ?? null, new Date().toISOString(), id);
      return result.changes ? this.findWithWorkspace(id) : undefined;
    })();
  }

  countSuppliers(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM suppliers').get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
