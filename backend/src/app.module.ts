import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';
import { HealthModule } from './health/health.module';
import { ScoringModule } from './scoring/scoring.module';
import { StorageModule } from './storage/storage.module';
import { SuppliersModule } from './suppliers/suppliers.module';

@Module({
  imports: [
    ...(process.env.NODE_ENV === 'production' && !process.env.VERCEL
      ? [ServeStaticModule.forRoot({
          rootPath: resolve(__dirname, '../../frontend/dist'),
          exclude: ['/api{*path}'],
        })]
      : []),
    StorageModule,
    SuppliersModule,
    ScoringModule,
    HealthModule,
  ],
})
export class AppModule {}
