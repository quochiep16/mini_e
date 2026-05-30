import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';

import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';

// Strategy cho access token, dùng với AuthGuard('jwt')
import { JwtAccessStrategy } from './strategies/jwt-access.service';

@Module({
  imports: [
    SmsModule,
    EmailModule,
    ConfigModule,
    TypeOrmModule.forFeature([User]),
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const secret = cfg.get<string>('ACCESS_TOKEN_SECRET');

        // Không dùng fallback "change_me" để tránh production chạy với secret yếu
        if (!secret) {
          throw new Error('Thiếu ACCESS_TOKEN_SECRET trong .env');
        }

        return {
          secret,
          signOptions: {
            expiresIn: cfg.get<string>('ACCESS_TOKEN_EXPIRES', '15m'),
          },
        };
      },
    }),
  ],
  providers: [AuthService, JwtAccessStrategy],
  controllers: [AuthController],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}