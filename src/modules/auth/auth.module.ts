// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';

// 👇 Strategy cho Access & Refresh (đặt tên 'jwt' cho access guard)
import { JwtAccessStrategy } from './strategies/jwt-access.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User]),
    UsersModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('ACCESS_TOKEN_SECRET', 'change_me'),
        signOptions: {
          expiresIn: cfg.get<string>('ACCESS_TOKEN_EXPIRES', '15m'),
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    JwtAccessStrategy,
  ],
  controllers: [AuthController],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}
