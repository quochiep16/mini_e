// src/config/mail.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('mail', () => ({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT ?? 465),
  secure: String(process.env.SMTP_SECURE ?? 'true') === 'true', // 465=true, 587=false
  user: process.env.SMTP_USER!,         // quochiep1610@gmail.com
  pass: process.env.SMTP_PASS!,         // xbrukrqfxqlfzbdd (Gmail App Password)
  from: process.env.MAIL_FROM || `"${process.env.APP_NAME || 'Mini E'}" <no-reply@minie.local>`,
}));
