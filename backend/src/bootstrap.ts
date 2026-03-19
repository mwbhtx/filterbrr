import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import express from 'express';
import type { INestApplication } from '@nestjs/common';

export interface BootstrapResult {
  app: INestApplication;
  expressApp: express.Express;
}

export async function createApp(): Promise<BootstrapResult> {
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({ origin: process.env.CORS_ORIGIN ?? '*' });
  return { app, expressApp };
}
