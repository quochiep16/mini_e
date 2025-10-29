import { Body, Controller, HttpCode, HttpStatus, Post, Res, Req, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';

import { ConfigService } from '@nestjs/config';
import { RequestResetDto } from './dto/request-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequestVerifyDto } from './dto/request-verify.dto';
import { VerifyAccountDto } from './dto/verify-account.dto';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

// ✅ DTO mới cho tính năng khôi phục tài khoản
import { AccountRecoverRequestDto } from './dto/account-recover-request.dto';
import { AccountRecoverConfirmDto } from './dto/account-recover-confirm.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

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

    // Nếu tài khoản bị xoá mềm ⇒ không cấp token, yêu cầu khôi phục
    if ((result as any)?.needRecover) {
      return res.status(423).json({
        success: false,
        statusCode: 423,
        data: result, // { needRecover: true, identifier, via }
        message: 'Tài khoản đã bị vô hiệu hoá. Vui lòng khôi phục trước khi đăng nhập.',
      });
    }

    // Đăng nhập bình thường: set refresh token cookie
    const cookieName = this.config.get<string>('REFRESH_COOKIE_NAME', 'refreshToken');
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    const weekMs = 7 * 24 * 60 * 60 * 1000;

    res.cookie(cookieName, (result as any).refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'strict' : 'lax',
      maxAge: weekMs,
      path: '/',
    });

    return res.status(HttpStatus.OK).json({
      success: true,
      statusCode: HttpStatus.OK,
      data: result, // vẫn trả nguyên result của bạn (access_token, refresh_token, user)
    });
  }

  // 🔹 Khôi phục tài khoản — bước 1: yêu cầu gửi OTP (email/phone)
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

  // 🔹 Khôi phục tài khoản — bước 2: xác nhận OTP + restore + đổi mật khẩu
  @Public()
  @Post('account/recover/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmRecover(@Body() dto: AccountRecoverConfirmDto) {
    const data = await this.authService.confirmAccountRecover(dto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data, // { restored: true, passwordChanged: true }
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const cookieName = this.config.get<string>('REFRESH_COOKIE_NAME', 'refreshToken');
    const rt = (req as any).cookies?.[cookieName];

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

  @Post('request-verify')
  @HttpCode(HttpStatus.OK)
  async requestVerify(@CurrentUser('sub') sub: string | number) {
    const userId = Number(sub);
    if (!userId || Number.isNaN(userId)) {
      throw new UnauthorizedException('Token không hợp lệ');
    }
    const data = await this.authService.requestVerifyForUser(userId);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Post('verify-account')
  @HttpCode(HttpStatus.OK)
  async verifyAccount(@CurrentUser('sub') sub: string | number, @Body() dto: VerifyAccountDto) {
    const userId = Number(sub);
    if (!userId || Number.isNaN(userId)) {
      throw new UnauthorizedException('Token không hợp lệ');
    }
    const data = await this.authService.verifyAccountForUser(userId, dto.otp);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      data,
    };
  }
}
