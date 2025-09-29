import { registerAs } from '@nestjs/config'; // Import registerAs để định nghĩa config namespace

export default registerAs('app', () => ({ // Định nghĩa namespace 'app' cho config
  name: process.env.APP_NAME ?? 'Mini E', // Tên app từ .env, mặc định 'Mini E'
  env: process.env.NODE_ENV ?? 'development', // Môi trường chạy, mặc định development
  port: Number(process.env.PORT ?? 3000), // Port server từ .env, mặc định 3000
  isProd: (process.env.NODE_ENV ?? 'development') === 'production', // Kiểm tra môi trường production
}));