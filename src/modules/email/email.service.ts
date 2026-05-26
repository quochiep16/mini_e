import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import mailConfig from '../../config/mail.config';
import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    @Inject(mailConfig.KEY)
    private readonly mailCfg: ConfigType<typeof mailConfig>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.mailCfg.host,
      port: this.mailCfg.port,
      secure: this.mailCfg.secure,
      auth: {
        user: this.mailCfg.user,
        pass: this.mailCfg.pass,
      },
    });

    this.transporter
      .verify()
      .then(() => {
        this.logger.log(
          `SMTP ready @ ${this.mailCfg.host}:${this.mailCfg.port} secure=${this.mailCfg.secure}`,
        );
      })
      .catch((err) => {
        this.logger.error('SMTP verify failed', err);
      });
  }

  private async send(to: string, subject: string, html: string) {
    return this.transporter.sendMail({
      from: this.mailCfg.from,
      to,
      subject,
      html,
    });
  }

  private getTemplatePath(templateFile: string) {
    const candidates = [
      path.join(__dirname, 'templates', templateFile),
      path.join(process.cwd(), 'src', 'modules', 'email', 'templates', templateFile),
      path.join(process.cwd(), 'dist', 'modules', 'email', 'templates', templateFile),
    ];

    const found = candidates.find((candidate) => fs.existsSync(candidate));

    if (!found) {
      throw new Error(`Không tìm thấy email template: ${templateFile}`);
    }

    return found;
  }

  private render(templateFile: string, vars: Record<string, string>) {
    const templatePath = this.getTemplatePath(templateFile);
    let html = fs.readFileSync(templatePath, 'utf8');

    for (const [key, value] of Object.entries(vars)) {
      html = html.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
    }

    return html;
  }

  async sendActivationCode(email: string, code: string) {
    const html = this.render('activation.html', {
      appName: 'Mini E',
      code,
      minutes: '5',
      supportEmail: this.mailCfg.user || 'support@minie.local',
    });

    await this.send(email, 'Mã xác minh tài khoản Mini E', html);
  }

  async sendPasswordResetCode(email: string, code: string) {
    const html = this.render('reset-password.html', {
      appName: 'Mini E',
      code,
      minutes: '5',
      supportEmail: this.mailCfg.user || 'support@minie.local',
    });

    await this.send(email, 'Mã đặt lại mật khẩu Mini E', html);
  }

  async sendChangePasswordCode(email: string, code: string) {
    const html = this.render('change-password.html', {
      appName: 'Mini E',
      code,
      minutes: '5',
      supportEmail: this.mailCfg.user || 'support@minie.local',
    });

    await this.send(email, 'Mã xác nhận đổi mật khẩu Mini E', html);
  }
}