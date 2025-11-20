import { Controller, Get, Query } from '@nestjs/common';
import { PaymentGatewayService } from './payment.gateway';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Order, OrderStatus, PaymentMethod, PaymentStatus } from './entities/order.entity';
import { PaymentSession, PaymentSessionStatus } from './entities/payment-session.entity';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly pg: PaymentGatewayService,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(PaymentSession) private readonly sessionRepo: Repository<PaymentSession>,
  ) {}

  // VNPay return (GET)
  @Get('vnpay/return')
  async vnpReturn(@Query() query: any) {
    const ret = this.pg.verifyVnPayReturn(query);
    if (!ret.valid) return { success: false, message: 'Invalid signature' };

    const session = await this.sessionRepo.findOne({ where: { code: ret.code } });
    if (!session) return { success: false, message: 'Payment session not found' };

    session.status = ret.responseCode === '00' ? PaymentSessionStatus.PAID : PaymentSessionStatus.FAILED;
    session.paymentRef = ret.transactionNo || null;
    session.paymentMeta = ret.raw;
    await this.sessionRepo.save(session);

    const codes = (session.ordersJson || []).map((o: any) => o.code);
    if (codes?.length && session.status === PaymentSessionStatus.PAID) {
      const orders = await this.orderRepo.find({ where: { code: In(codes) } as any });
      for (const o of orders) {
        o.paymentMethod = PaymentMethod.VNPAY;
        o.paymentStatus = PaymentStatus.PAID;
        o.status = OrderStatus.PAID;
        o.paymentRef = session.paymentRef;
        o.paymentMeta = { sessionCode: session.code };
      }
      await this.orderRepo.save(orders);
    }

    return { success: true, data: { sessionCode: session.code, status: session.status } };
  }
}
