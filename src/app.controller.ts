import { Controller, Get } from '@nestjs/common'; // Import Controller và Get từ NestJS
import { AppService } from './app.service'; // Import service để xử lý logic

@Controller() // Không prefix, map tới /api (do global prefix)
export class AppController {
  constructor(private readonly appService: AppService) {} // Inject AppService

  @Get() // Map GET /api
  getHello(): string { // Hàm xử lý request GET /api
    return this.appService.getHello(); // Gọi service trả chuỗi
  }
}
