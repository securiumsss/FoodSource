import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { CompareResponse, SupplierDetailResponse, SuppliersListResponse } from '@food-suppliers/shared';
import { parseCompare, parseQuery, parseWorkspaceUpdate } from './request-validation';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  findAll(@Query() query: unknown): Promise<SuppliersListResponse> {
    return this.suppliers.findAll(parseQuery(query));
  }

  @Post('compare')
  @HttpCode(200)
  compare(@Body() body: unknown): Promise<CompareResponse> {
    return this.suppliers.compare(parseCompare(body));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query() query: unknown): Promise<SupplierDetailResponse> {
    return this.suppliers.findOne(id, parseQuery(query, true));
  }

  @Patch(':id/workspace')
  updateWorkspace(@Param('id') id: string, @Body() body: unknown): Promise<SupplierDetailResponse> {
    return this.suppliers.updateWorkspace(id, parseWorkspaceUpdate(body));
  }
}
