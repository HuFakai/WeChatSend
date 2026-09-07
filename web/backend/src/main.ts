import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const cfg = config();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: cfg.APP_ORIGIN.split(',').map((item) => item.trim()), credentials: false });
  app.enableShutdownHooks();
  await app.listen(cfg.API_PORT, '0.0.0.0');
}

void bootstrap();
