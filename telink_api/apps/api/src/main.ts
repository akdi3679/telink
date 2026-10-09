import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.use(helmet());
  app.enableCors({
    origin: process.env.APP_CORS_ORIGINS?.split(',') ?? true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();

  const port = parseInt(process.env.APP_PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 API listening on http://0.0.0.0:${port}`);
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap failed:', e);
  process.exit(1);
});