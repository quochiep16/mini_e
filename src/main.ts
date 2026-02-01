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

  // ========= CORS cho FE dev + Flutter Web (giữ nguyên + bổ sung) =========
  const config = app.get(ConfigService);

  // Cho phép mọi localhost:<port> / 127.0.0.1:<port> (Flutter Web/FE dev hay đổi cổng)
  const allowLocalRegexes = [
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ];

  // Cho phép thêm qua ENV mà không sửa code:
  // CORS_ORIGINS="http://192.168.1.50:5173,https://fe.example.com"
  const extraFromEnv =
    (config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  // Giữ NGUYÊN các origin bạn đã viết + có thể thêm nữa
  const allowList = new Set<string>([
    'http://localhost:5173',   // FE dev (Vite)
    'http://localhost:3000',   // FE/BE cùng cổng hoặc FE dev
    'http://192.168.1.199',    // FE qua Nginx (80)
    'http://192.168.1.199:80',
    ...extraFromEnv,
  ]);

  app.enableCors({
    origin: (origin, cb) => {
      // Postman/cURL thường không có Origin -> cho qua
      if (!origin) return cb(null, true);

      if (allowList.has(origin) || allowLocalRegexes.some((re) => re.test(origin))) {
        return cb(null, true);
      }
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true, // bạn đang dùng cookie httpOnly nên giữ true
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });
  // =======================================================================

  const port = config.get<number>('app.port') ?? Number(process.env.PORT ?? 3000);

  // lắng nghe trên tất cả interface để máy khác trong LAN truy cập được
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 ${config.get('app.name') ?? 'App'} running at http://0.0.0.0:${port}`);
}
bootstrap();
