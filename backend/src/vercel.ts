import 'reflect-metadata';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { NestFactory } from '@nestjs/core';

async function initialize() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL is missing');
  process.env.VERCEL = '1';
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  app.setGlobalPrefix('api');
  await app.init();
  return app.getHttpAdapter().getInstance() as (req: IncomingMessage, res: ServerResponse) => void;
}

let initialization: ReturnType<typeof initialize> | undefined;
export = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  let handler: Awaited<ReturnType<typeof initialize>>;
  try {
    initialization ??= initialize();
    handler = await initialization;
  } catch {
    initialization = undefined;
    console.error('Could not initialize the FoodSource API. Verify server configuration.');
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ message: 'API initialization failed' }));
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  handler(req, res);
};
