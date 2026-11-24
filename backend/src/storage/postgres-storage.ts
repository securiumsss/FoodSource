import { Pool } from 'pg';
import type { Supplier, SupplierStatus, WorkspaceUpdateDto } from '@food-suppliers/shared';
import type { StoredSupplier } from './storage.service';

export function createPostgresPool(connectionString: string): Pool {
  const url = new URL(connectionString);
  const useTls = url.searchParams.get('sslmode') !== 'disable';
  if (!useTls && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Disabling database TLS is only allowed for local PostgreSQL');
  }
  for (const name of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return new Pool({
    connectionString: url.toString(),
    ssl: useTls ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false,
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    allowExitOnIdle: true,
  }).on('error', () => { console.warn('An idle PostgreSQL connection was closed'); });
}

type StoredRow = { data: Supplier; status: SupplierStatus; notes: string; updated_at: Date | null };
const asStored = (row: StoredRow): StoredSupplier => ({
  supplier: row.data,
  workspace: { status: row.status, notes: row.notes, updatedAt: row.updated_at?.toISOString() ?? null },
});
const joined = `
  SELECT s.data, w.status, w.notes, w.updated_at
  FROM foodsource.suppliers s JOIN foodsource.supplier_workspace w ON w.supplier_id = s.id
`;

export class PostgresStorage {
  private readonly pool: Pool;

  constructor(url: string) { this.pool = createPostgresPool(url); }

  async listWithWorkspace(): Promise<StoredSupplier[]> {
    return (await this.pool.query<StoredRow>(joined + ' ORDER BY s.id')).rows.map(asStored);
  }

  async findWithWorkspace(id: string): Promise<StoredSupplier | undefined> {
    const { rows: [row] } = await this.pool.query<StoredRow>(joined + ' WHERE s.id = $1', [id]);
    return row && asStored(row);
  }

  async updateWorkspace(id: string, update: WorkspaceUpdateDto): Promise<StoredSupplier | undefined> {
    const { rows: [row] } = await this.pool.query<StoredRow>(`
      WITH updated AS (
        UPDATE foodsource.supplier_workspace
        SET status = COALESCE($2, status), notes = COALESCE($3, notes), updated_at = clock_timestamp()
        WHERE supplier_id = $1 RETURNING supplier_id, status, notes, updated_at
      )
      SELECT s.data, w.status, w.notes, w.updated_at
      FROM updated w JOIN foodsource.suppliers s ON s.id = w.supplier_id
    `, [id, update.status ?? null, update.notes ?? null]);
    return row && asStored(row);
  }

  async countSuppliers(): Promise<number> {
    const { rows: [row] } = await this.pool.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM foodsource.suppliers');
    return row.count;
  }

  async close(): Promise<void> { await this.pool.end(); }
}
