import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Supplier, SupplierWorkspaceState, WorkspaceUpdateDto } from '@food-suppliers/shared';
import { PostgresStorage } from './postgres-storage';
import type { SqliteStorage } from './sqlite-storage';

export interface StoredSupplier {
  supplier: Supplier;
  workspace: SupplierWorkspaceState;
}

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly adapter: PostgresStorage | SqliteStorage;

  constructor() {
    const url = process.env.DATABASE_URL?.trim();
    if (url) {
      this.adapter = new PostgresStorage(url);
    } else {
      if (process.env.VERCEL) throw new Error('DATABASE_URL must be configured for Vercel');
      const { SqliteStorage } = require('./sqlite-storage') as typeof import('./sqlite-storage');
      this.adapter = new SqliteStorage();
    }
  }

  async listWithWorkspace(): Promise<StoredSupplier[]> { return this.adapter.listWithWorkspace(); }
  async findWithWorkspace(id: string): Promise<StoredSupplier | undefined> { return this.adapter.findWithWorkspace(id); }
  async updateWorkspace(id: string, update: WorkspaceUpdateDto): Promise<StoredSupplier | undefined> { return this.adapter.updateWorkspace(id, update); }
  async countSuppliers(): Promise<number> { return this.adapter.countSuppliers(); }
  async onModuleDestroy(): Promise<void> { await this.adapter.close(); }
}
