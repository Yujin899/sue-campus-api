import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // required by Better Auth
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  app.enableCors({
    origin: (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 5000);
}
void bootstrap();
