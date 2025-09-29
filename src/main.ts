import { NestFactory } from '@nestjs/core'; // Import NestFactory để tạo app
import { AppModule } from './app.module'; // Import module root
import { ValidationPipe } from '@nestjs/common'; // Import ValidationPipe
import { ConfigService } from '@nestjs/config'; // Import ConfigService
import { ApiExceptionFilter } from './common/filters/http-exception.filter'; // Import filter lỗi

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true }); // Tạo app với CORS bật
  const configService = app.get(ConfigService); // Lấy ConfigService

  app.setGlobalPrefix('api'); // Giữ prefix /api
  app.useGlobalFilters(new ApiExceptionFilter()); // Áp dụng filter lỗi
  app.useGlobalPipes(new ValidationPipe({ // Áp dụng ValidationPipe
    transform: true, // Transform DTO
    whitelist: true, // Loại bỏ field không hợp lệ
    forbidUnknownValues: true, // Throw lỗi field lạ
  }));

  const port = configService.get<number>('app.port') ?? 3000; // Lấy port
  await app.listen(port); // Khởi động server
  console.log(`🚀 ${configService.get('app.name')} running at http://localhost:${port}/api`); // Log URL
}
bootstrap(); // Gọi bootstrap