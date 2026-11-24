import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { initializeDatabase, projectRoot } from './database';

describe('SQLite initialization', () => {
  it('seeds suppliers once and preserves workspace changes on reinitialization', () => {
    const temp = mkdtempSync(join(tmpdir(), 'food-suppliers-test-'));
    const dbPath = join(temp, 'test.db');
    const seedPath = resolve(projectRoot, 'data/suppliers.seed.json');
    const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as { id: string }[];

    try {
      const first = initializeDatabase(dbPath, seedPath);
      expect(first.prepare('SELECT COUNT(*) AS count FROM suppliers').get()).toEqual({ count: seed.length });
      expect(first.prepare('SELECT COUNT(*) AS count FROM supplier_workspace').get()).toEqual({ count: seed.length });
      first.prepare('UPDATE supplier_workspace SET notes = ? WHERE supplier_id = ?').run('saved note', seed[0].id);
      const original = first.prepare('SELECT data FROM suppliers WHERE id = ?').get(seed[0].id) as { data: string };
      const edited = JSON.stringify({ ...JSON.parse(original.data), description: 'saved description' });
      first.prepare('UPDATE suppliers SET data = ? WHERE id = ?').run(edited, seed[0].id);
      first.close();

      const second = initializeDatabase(dbPath, seedPath);
      expect(second.prepare('SELECT COUNT(*) AS count FROM suppliers').get()).toEqual({ count: seed.length });
      expect(second.prepare('SELECT COUNT(*) AS count FROM supplier_workspace').get()).toEqual({ count: seed.length });
      expect(second.prepare('SELECT notes FROM supplier_workspace WHERE supplier_id = ?').get(seed[0].id)).toEqual({ notes: 'saved note' });
      expect(second.prepare('SELECT data FROM suppliers WHERE id = ?').get(seed[0].id)).toEqual({ data: edited });
      second.close();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('migrates an existing workspace table without losing its status or notes', () => {
    const temp = mkdtempSync(join(tmpdir(), 'food-suppliers-migration-'));
    const dbPath = join(temp, 'legacy.db');
    const seedPath = resolve(projectRoot, 'data/suppliers.seed.json');
    const seed = JSON.parse(readFileSync(seedPath, 'utf8')) as { id: string }[];
    try {
      const legacy = new Database(dbPath);
      legacy.exec(`
        CREATE TABLE suppliers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE supplier_workspace (supplier_id TEXT PRIMARY KEY REFERENCES suppliers(id), status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '');
      `);
      legacy.prepare('INSERT INTO suppliers (id, data) VALUES (?, ?)').run(seed[0].id, JSON.stringify(seed[0]));
      legacy.prepare('INSERT INTO supplier_workspace (supplier_id, status, notes) VALUES (?, ?, ?)').run(seed[0].id, 'contacted', 'сохранённая заметка');
      legacy.close();
      const migrated = initializeDatabase(dbPath, seedPath);
      expect(migrated.prepare('SELECT status, notes, updated_at FROM supplier_workspace WHERE supplier_id = ?').get(seed[0].id))
        .toEqual({ status: 'contacted', notes: 'сохранённая заметка', updated_at: null });
      migrated.close();
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
