import { Module } from '@nestjs/common';
import { ScoringModule } from '../scoring/scoring.module';
import { StorageModule } from '../storage/storage.module';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

@Module({ imports: [StorageModule, ScoringModule], controllers: [SuppliersController], providers: [SuppliersService] })
export class SuppliersModule {}
