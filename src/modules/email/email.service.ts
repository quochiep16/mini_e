// src/modules/email/email.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import mailConfig from '../../config/mail.config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @Inject(mailConfig.KEY)               // ✅ inject bằng token
    private readonly mailCfg: ConfigType<typeof mailConfig>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.mailCfg.host,
      port: this.mailCfg.port,
      secure: this.mailCfg.secure,
      auth: { user: this.mailCfg.user, pass: this.mailCfg.pass },
    });

    this.transporter.verify()
      .then(() =>
        this.logger.log(
          `SMTP ready @ ${this.mailCfg.host}:${this.mailCfg.port} (secure=${this.mailCfg.secure})`,
        ),
      )
      .catch((err) => this.logger.error('SMTP verify failed', err));
  }

  private async send(to: string, subject: string, html: string) {
    await this.transporter.sendMail({
      from: this.mailCfg.from,
      to,
      subject,
      html,
    });
  }

  private render(templateFile: string, vars: Record<string, string>) {
    // chú ý: __dirname trỏ tới dist; cần copy templates sang dist (xem lưu ý bên dưới)
    const p = path.join(__dirname, 'templates', templateFile);
    let html = fs.readFileSync(p, 'utf8');
    for (const [k, v] of Object.entries(vars)) {
      html = html.replace(new RegExp(`{{\\s*${k}\\s*}}`, 'g'), v);
    }
    return html;
  }

  async sendActivationCode(email: string, code: string) {
    const html = this.render('activation.html', {
      appName: 'Mini E',
      code,
      minutes: '5',
    });
    await this.send(email, 'Xác minh tài khoản Mini E', html);
  }

  async sendPasswordResetCode(email: string, code: string) {
    const html = this.render('reset-password.html', {
      appName: 'Mini E',
      code,
      minutes: '5',
    });
    await this.send(email, 'Đặt lại mật khẩu Mini E', html);
  }
}
