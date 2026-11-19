import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Necessário atrás de proxies reversos (Koyeb, Render, Cloudflare, Nginx) para cookies Secure/HTTPS
  app.set('trust proxy', 1);

  const corsOrigin =
    process.env.CORS_ORIGIN ??
    'http://localhost:3000,http://localhost:3002,http://localhost:3003,http://localhost:3004';
  const origins = corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`Hub API running on http://0.0.0.0:${port}/api`);
}

bootstrap();
