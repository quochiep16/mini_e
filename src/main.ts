import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExceptionFilter } from './common/filters/http-exception.filter';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'; // [1] Import Swagger
import cookieParser from 'cookie-parser';

async function bootstrap() {
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

  const config = app.get(ConfigService);

  // [2] Cấu hình Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.get('app.name') || 'E-commerce API') // Lấy tên app từ config
    .setDescription('Tài liệu API cho hệ thống E-commerce')
    .setVersion('1.0')
    .addBearerAuth() // Cho phép test API có JWT Token
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // Đường dẫn sẽ là: domain/api/docs (Ví dụ: http://localhost:3000/api/docs)
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // Giữ lại token sau khi F5 trang
    },
  });

  // ========= CORS cho FE dev + Flutter Web (Giữ nguyên cấu hình của bạn) =========
  const allowLocalRegexes = [
    /^http:\/\/localhost:\d+$/,
    /^http:\/\/127\.0\.0\.1:\d+$/,
  ];

  const extraFromEnv =
    (config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const allowList = new Set<string>([
    'http://localhost:5173',
    'http://localhost:3000',
    'http://192.168.1.199',
    'http://192.168.1.199:80',
    ...extraFromEnv,
  ]);

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowList.has(origin) || allowLocalRegexes.some((re) => re.test(origin))) {
        return cb(null, true);
      }
      return cb(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    optionsSuccessStatus: 204,
    preflightContinue: false,
  });
  // =======================================================================

  const port = config.get<number>('app.port') ?? Number(process.env.PORT ?? 3000);

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 ${config.get('app.name') ?? 'App'} running at http://localhost:${port}/api/docs`);
}
bootstrap();