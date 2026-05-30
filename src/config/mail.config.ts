import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
  user: process.env.SMTP_USER!,
  pass: process.env.SMTP_PASS!,
  from: process.env.MAIL_FROM || `"${process.env.APP_NAME || 'Mini E'}" <no-reply@minie.local>`,
}));