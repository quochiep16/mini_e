import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { PaymentGatewayService } from './payment.gateway';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentSession, PaymentSessionStatus } from './entities/payment-session.entity';
import { OrdersService } from './orders.service';
import { Public } from 'src/common/decorators/public.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly config: ConfigService,
    private readonly pg: PaymentGatewayService,
    private readonly ordersService: OrdersService,
    @InjectRepository(PaymentSession) private readonly sessionRepo: Repository<PaymentSession>,
  ) {}

  private fePath(path: string) {
    const base = this.config.get<string>('FRONTEND_URL') || 'http://localhost:5173';
    return `${String(base).replace(/\/$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  // Browser redirect URL
  @Public()
  @Get('vnpay/return')
  async vnpReturn(@Query() query: any, @Res() res: Response) {
    const ret = this.pg.verifyVnPayReturn(query);
    const code = ret.code || '';

    if (!ret.valid) {
      return res.redirect(this.fePath(`/payment-result?status=invalid&code=${encodeURIComponent(code)}`));
    }

    const session = await this.sessionRepo.findOne({ where: { code } });
    if (!session) {
      return res.redirect(this.fePath(`/payment-result?status=session_not_found&code=${encodeURIComponent(code)}`));
    }

    // thất bại
    if (ret.responseCode !== '00') {
      session.status = PaymentSessionStatus.FAILED;
      session.paymentRef = ret.transactionNo || null;
      session.paymentMeta = ret.raw;
      await this.sessionRepo.save(session);

      return res.redirect(
        this.fePath(
          `/payment-result?status=failed&code=${encodeURIComponent(code)}&rc=${encodeURIComponent(ret.responseCode)}`,
        ),
      );
    }

    // thành công => tạo order
    try {
      await this.ordersService.finalizeVnPayPaid(code, ret);
    } catch (e: any) {
      // nếu finalize lỗi, vẫn redirect để user thấy trạng thái
      return res.redirect(
        this.fePath(`/payment-result?status=finalize_error&code=${encodeURIComponent(code)}&msg=${encodeURIComponent(
          e?.message || 'finalize error',
        )}`),
      );
    }

    return res.redirect(this.fePath(`/orders?paid=1&session=${encodeURIComponent(code)}`));
  }

  // IPN server-to-server
  @Public()
  @Get('vnpay/ipn')
  async vnpIpn(@Query() query: any, @Res() res: Response) {
    const ret = this.pg.verifyVnPayReturn(query);
    if (!ret.valid) return res.json({ RspCode: '97', Message: 'Invalid signature' });

    const session = await this.sessionRepo.findOne({ where: { code: ret.code } });
    if (!session) return res.json({ RspCode: '01', Message: 'Payment session not found' });

    // đã PAID thì OK
    if (session.status === PaymentSessionStatus.PAID) return res.json({ RspCode: '00', Message: 'OK' });

    // thất bại
    if (ret.responseCode !== '00') {
      session.status = PaymentSessionStatus.FAILED;
      session.paymentRef = ret.transactionNo || null;
      session.paymentMeta = ret.raw;
      await this.sessionRepo.save(session);
      return res.json({ RspCode: '00', Message: 'OK' });
    }

    // thành công => finalize
    try {
      await this.ordersService.finalizeVnPayPaid(ret.code, ret);
    } catch {
      // IPN vẫn trả OK để tránh VNPAY retry spam
    }

    return res.json({ RspCode: '00', Message: 'OK' });
  }
}
