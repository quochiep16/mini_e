// src/modules/auth/strategies/jwt-access.service.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('ACCESS_TOKEN_SECRET', 'change_me'),
      ignoreExpiration: false,
    });
  }
  // payload chính là cái bạn ký ở login: { sub, email, role }
  async validate(payload: any) {
    return payload; // => gắn vào req.user
  }
}
