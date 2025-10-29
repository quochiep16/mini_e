import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './common/filters/http-exception.filter';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  // bỏ cors: true, tự cấu hình enableCors bên dưới
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

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

  // CORS cho FE dev và cho server sau này
  app.enableCors({
    origin: [
      'http://localhost:5173',      // FE dev (Vite)
      'http://localhost:3000',      // nếu bạn test FE/BE cùng cổng cục bộ
      'http://192.168.1.199',       // FE chạy qua Nginx cổng 80
      'http://192.168.1.199:80',
    ],
    credentials: true, // nếu bạn dùng cookie httpOnly
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Authorization, X-Requested-With',
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') ?? Number(process.env.PORT ?? 3000);

  // lắng nghe trên tất cả interface để máy khác trong LAN truy cập được
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 ${config.get('app.name') ?? 'App'} running at http://0.0.0.0:${port}`);
}
bootstrap();
