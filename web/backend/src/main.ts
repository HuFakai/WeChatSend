import './load-env';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const cfg = config();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.useBodyParser('text', { type: ['text/xml', 'application/xml'], limit: '128kb' });
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({ origin: cfg.APP_ORIGIN.split(',').map((item) => item.trim()), credentials: false });
  app.enableShutdownHooks();
  await app.listen(cfg.API_PORT, '0.0.0.0');
}

void bootstrap();
