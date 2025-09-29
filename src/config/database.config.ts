import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  pass: process.env.DB_PASS ?? '123456',
  name: process.env.DB_NAME ?? 'mini_ecommerce',
  ssl: (process.env.DB_SSL ?? 'false') === 'true',
}));
