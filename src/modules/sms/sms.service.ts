import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private client?: ReturnType<typeof twilio>;

  constructor(private readonly config: ConfigService) {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');

    if (sid && token) {
      this.client = twilio(sid, token);
    } else {
      this.logger.warn('Twilio env missing, SMS will not work.');
    }
  }

  async sendOtp(toPhoneE164: string, otp: string) {
    const from = this.config.get<string>('TWILIO_FROM_NUMBER');
    if (!this.client) throw new Error('Twilio client not initialized');
    if (!from) throw new Error('Missing TWILIO_FROM_NUMBER');

    const app = this.config.get<string>('APP_NAME', 'Mini E');
    const minutes = Number(this.config.get('OTP_WINDOW_MINUTES') ?? 5);
    const body = `[${app}] Ma OTP: ${otp}. Hieu luc ${minutes} phut.`;

    await this.client.messages.create({
      to: toPhoneE164,
      from,
      body,
    });
  }
}
