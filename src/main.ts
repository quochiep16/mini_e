import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './common/filters/http-exception.filter';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? Number(process.env.PORT ?? 3000);

  await app.listen(port);
  console.log(`🚀 ${config.get('app.name') ?? 'App'} running at http://localhost:${port}`);
}
bootstrap();
