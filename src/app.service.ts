import { Injectable } from '@nestjs/common'; // Import Injectable để định nghĩa service

@Injectable() // Đánh dấu class là injectable
export class AppService {
  getHello(): string { // Hàm trả chuỗi cho route /api
    return 'Hello World!'; // Chuỗi trả về
  }
}