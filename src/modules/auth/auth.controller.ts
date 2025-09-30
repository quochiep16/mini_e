import { Body, Controller, HttpCode, HttpStatus, Post , Res , Req} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type {  Request , Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';

import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService , private readonly config: ConfigService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const user = await this.authService.register(dto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      data: user,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(dto);
    // set refresh token cookie
    const cookieName = this.config.get<string>('REFRESH_COOKIE_NAME', 'refreshToken');
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    res.cookie(cookieName, result.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: weekMs,
      path: '/',
    });

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const cookieName = this.config.get<string>('REFRESH_COOKIE_NAME', 'refreshToken');
    const rt = req.cookies?.[cookieName];

    const result = await this.authService.refresh(rt);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() _req: Request, @Res() res: Response) {
    const cookieName = this.config.get<string>('REFRESH_COOKIE_NAME', 'refreshToken');
    const isProd = this.config.get<string>('NODE_ENV') === 'production';

    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      path: '/',
    });

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: { loggedOut: true },
    });
  }
}
