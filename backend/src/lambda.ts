import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import serverlessExpress from '@vendia/serverless-express';
import express from 'express';
import { Handler } from 'aws-lambda';

let server: Handler;

async function bootstrap(): Promise<Handler> {
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const app = await NestFactory.create(AppModule, adapter);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors();
  app.use((req: any, _res: any, next: any) => {
    if (req.user?.userId) req.userId = req.user.userId;
    next();
  });
  await app.init();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (event, context, callback) => {
  server = server ?? (await bootstrap());
  return server(event, context, callback);
};
