import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import mailConfig from '../../config/mail.config';
import { EmailService } from './email.service';


@Module({
imports: [ConfigModule.forFeature(mailConfig)],
providers: [EmailService],
exports: [EmailService],
})
export class EmailModule {}