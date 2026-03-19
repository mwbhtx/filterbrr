import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createApp } from './bootstrap';

async function bootstrap() {
  const { app } = await createApp();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
