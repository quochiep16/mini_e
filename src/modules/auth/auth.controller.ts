import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { RequestVerifyDto } from './dto/request-verify.dto';
import { AccountRecoverRequestDto } from './dto/account-recover-request.dto';
import { AccountRecoverConfirmDto } from './dto/account-recover-confirm.dto';

import { Public } from 'src/common/decorators/public.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { AllowUnverified } from 'src/common/decorators/allow-unverified.decorator';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private getRefreshCookieName(): string {
    return this.config.get<string>('REFRESH_COOKIE_NAME', 'refreshToken');
  }

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  private getRefreshCookieMaxAge(): number {
    return 7 * 24 * 60 * 60 * 1000;
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    const isProd = this.isProduction();

    res.cookie(this.getRefreshCookieName(), refreshToken, {
      httpOnly: true,

      // Production bắt buộc secure=true nếu sameSite='none'
      secure: isProd,

      // Local dùng lax cho dễ test.
      // Production dùng none để FE và BE khác domain vẫn gửi được refresh cookie.
      sameSite: isProd ? 'none' : 'lax',

      maxAge: this.getRefreshCookieMaxAge(),
      path: '/',
    });
  }

  private clearRefreshCookie(res: Response) {
    const isProd = this.isProduction();

    res.clearCookie(this.getRefreshCookieName(), {
      httpOnly: true,
      secure: isProd,

      // Phải giống với lúc set cookie để clear chính xác trên production
      sameSite: isProd ? 'none' : 'lax',

      path: '/',
    });
  }

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

    if ((result as any)?.needRecover) {
      return res.status(423).json({
        success: false,
        statusCode: 423,
        message:
          'Tài khoản đã bị vô hiệu hoá. Vui lòng khôi phục trước khi đăng nhập.',
        data: result,
      });
    }

    const { refresh_token, ...safeResult } = result as any;

    if (refresh_token) {
      this.setRefreshCookie(res, refresh_token);
    }

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: safeResult,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const cookieName = this.getRefreshCookieName();
    const refreshToken = (req as any).cookies?.[cookieName];

    const result = await this.authService.refresh(refreshToken);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res() res: Response) {
    this.clearRefreshCookie(res);

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        loggedOut: true,
      },
    });
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: RequestResetDto) {
    const data = await this.authService.requestPasswordReset(dto);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const data = await this.authService.resetPassword(dto);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Public()
  @Post('account/recover/request')
  @HttpCode(HttpStatus.OK)
  async requestRecover(@Body() dto: AccountRecoverRequestDto) {
    const data = await this.authService.requestAccountRecover(dto);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Public()
  @Post('account/recover/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmRecover(@Body() dto: AccountRecoverConfirmDto) {
    const data = await this.authService.confirmAccountRecover(dto);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @AllowUnverified()
  @Post('request-verify')
  @HttpCode(HttpStatus.OK)
  async requestVerify(
    @CurrentUser('id') userIdRaw: string | number,
    @Body() dto?: RequestVerifyDto,
  ) {
    const userId = Number(userIdRaw);

    if (!userId || Number.isNaN(userId)) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const data = await this.authService.requestVerifyForUser(userId, dto?.via);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @AllowUnverified()
  @Post('verify-account')
  @HttpCode(HttpStatus.OK)
  async verifyAccount(
    @CurrentUser('id') userIdRaw: string | number,
    @Body() dto: VerifyAccountDto,
    @Res() res: Response,
  ) {
    const userId = Number(userIdRaw);

    if (!userId || Number.isNaN(userId)) {
      throw new UnauthorizedException('Token không hợp lệ');
    }

    const data = await this.authService.verifyAccountForUser(userId, dto.otp);

    const { refresh_token, ...safeData } = data as any;

    if (refresh_token) {
      this.setRefreshCookie(res, refresh_token);
    }

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: safeData,
    });
  }
}