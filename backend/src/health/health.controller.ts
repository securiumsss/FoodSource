import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@food-suppliers/shared';
import { StorageService } from '../storage/storage.service';

@Controller('health')
export class HealthController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  async health(): Promise<HealthResponse> {
    return { status: 'ok', suppliersCount: await this.storage.countSuppliers() };
  }
}
