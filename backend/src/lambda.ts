import { createApp } from './bootstrap';
import serverlessExpress from '@vendia/serverless-express';
import { Handler } from 'aws-lambda';

let server: Handler;

async function bootstrap(): Promise<Handler> {
  const { app, expressApp } = await createApp();
  await app.init();
  return serverlessExpress({ app: expressApp });
}

export const handler: Handler = async (event, context, callback) => {
  server = server ?? (await bootstrap());
  return server(event, context, callback);
};
