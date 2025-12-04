import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as qs from 'querystring';
import * as QRCode from 'qrcode';

@Injectable()
export class PaymentGatewayService {
  constructor(private readonly config: ConfigService) {}

  createVnPayUrl(params: { code: string; amount: number; ipAddress: string; bankCode?: string; }) {
    const vnp = this.config.get('payment.vnp');
    const createDate = this.formatDate(new Date());
    const vnpParams: any = {
      vnp_Version: vnp.version,
      vnp_Command: 'pay',
      vnp_TmnCode: vnp.tmnCode,
      vnp_Locale: vnp.locale,
      vnp_CurrCode: vnp.currency,
      vnp_TxnRef: params.code,
      vnp_OrderInfo: `Thanh toan don hang ${params.code}`,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(params.amount * 100),
      vnp_ReturnUrl: vnp.returnUrl,
      vnp_IpAddr: params.ipAddress || '127.0.0.1',
      vnp_CreateDate: createDate,
    };
    if (params.bankCode) vnpParams['vnp_BankCode'] = params.bankCode;

    const signData = this.sortObj(vnpParams);
    const sign = crypto.createHmac('sha512', vnp.hashSecret).update(signData).digest('hex');
    vnpParams['vnp_SecureHash'] = sign;

    const query = qs.stringify(vnpParams, undefined, undefined, { encodeURIComponent });
    return `${vnp.endpoint}?${query}`;
  }

  async urlToQrDataUrl(url: string): Promise<string> {
    return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, scale: 6 });
  }

  verifyVnPayReturn(queryParams: any) {
    const vnp = this.config.get('payment.vnp');
    const secureHash = queryParams['vnp_SecureHash'];
    const input: any = { ...queryParams };
    delete input['vnp_SecureHash'];
    delete input['vnp_SecureHashType'];

    const signData = this.sortObj(input);
    const check = crypto.createHmac('sha512', vnp.hashSecret).update(signData).digest('hex');
    const valid = check === secureHash;
    return {
      valid,
      code: input['vnp_TxnRef'],
      responseCode: input['vnp_ResponseCode'],
      transactionNo: input['vnp_TransactionNo'],
      raw: input
    };
  }

  private sortObj(obj: any) {
    const keys = Object.keys(obj).sort();
    return keys.map(k => `${k}=${encodeURIComponent(obj[k])}`).join('&');
  }
  private formatDate(d: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
}
