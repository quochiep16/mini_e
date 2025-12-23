import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

type VnpConfig = {
  version: string;
  tmnCode: string;
  hashSecret: string;
  endpoint: string;
  returnUrl: string;
  locale: string;
  currency: string;
};

@Injectable()
export class PaymentGatewayService {
  constructor(private readonly config: ConfigService) {}

  private getVnpConfig(): VnpConfig {
    // Hỗ trợ cả VNPAY_* và VNP_* (fallback)
    const version = this.config.get<string>('VNPAY_VERSION') || this.config.get<string>('VNP_VERSION') || '2.1.0';
    const tmnCode = this.config.get<string>('VNPAY_TMN_CODE') || this.config.get<string>('VNP_TMN_CODE') || '';
    const hashSecret =
      this.config.get<string>('VNPAY_HASH_SECRET') || this.config.get<string>('VNP_HASH_SECRET') || '';
    const endpoint =
      this.config.get<string>('VNPAY_ENDPOINT') || this.config.get<string>('VNP_ENDPOINT') || '';
    const returnUrl =
      this.config.get<string>('VNPAY_RETURN_URL') || this.config.get<string>('VNP_RETURN_URL') || '';
    const locale = this.config.get<string>('VNPAY_LOCALE') || this.config.get<string>('VNP_LOCALE') || 'vn';
    const currency = this.config.get<string>('VNPAY_CURRENCY') || this.config.get<string>('VNP_CURRENCY') || 'VND';

    const missing: string[] = [];
    if (!tmnCode) missing.push('VNPAY_TMN_CODE (or VNP_TMN_CODE)');
    if (!hashSecret) missing.push('VNPAY_HASH_SECRET (or VNP_HASH_SECRET)');
    if (!endpoint) missing.push('VNPAY_ENDPOINT (or VNP_ENDPOINT)');
    if (!returnUrl) missing.push('VNPAY_RETURN_URL (or VNP_RETURN_URL)');

    if (missing.length) {
      throw new BadRequestException(`VNPAY config missing: ${missing.join(', ')}`);
    }

    return { version, tmnCode, hashSecret, endpoint, returnUrl, locale, currency };
  }

  createVnPayUrl(params: { code: string; amount: number; ipAddress: string; bankCode?: string }) {
    const vnp = this.getVnpConfig();
    const createDate = this.formatDate(new Date());

    const vnpParams: Record<string, any> = {
      vnp_Version: vnp.version,
      vnp_Command: 'pay',
      vnp_TmnCode: vnp.tmnCode,
      vnp_Locale: vnp.locale,
      vnp_CurrCode: vnp.currency,
      vnp_TxnRef: params.code,
      vnp_OrderInfo: `Thanh toan don hang ${params.code}`,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(params.amount * 100), // bắt buộc *100
      vnp_ReturnUrl: vnp.returnUrl,
      vnp_IpAddr: params.ipAddress || '127.0.0.1',
      vnp_CreateDate: createDate,
    };

    if (params.bankCode) vnpParams.vnp_BankCode = params.bankCode;

    const sortedKeys = Object.keys(vnpParams).sort();
    const hashData = sortedKeys
      .map((k) => `${this.vnpEncode(k)}=${this.vnpEncode(String(vnpParams[k]))}`)
      .join('&');

    const secureHash = crypto.createHmac('sha512', vnp.hashSecret).update(hashData).digest('hex');

    const query = sortedKeys
      .map((k) => `${this.vnpEncode(k)}=${this.vnpEncode(String(vnpParams[k]))}`)
      .concat([`vnp_SecureHash=${this.vnpEncode(secureHash)}`])
      .join('&');

    return `${vnp.endpoint}?${query}`;
  }

  async urlToQrDataUrl(url: string): Promise<string> {
    // QR này là QR "mở link" (không phải VNPAYQR payload chuẩn)
    // Bạn không cần dùng nếu redirect sang VNPAY gateway (QR chuẩn sẽ nằm bên VNPAY).
    return QRCode.toDataURL(url, {
      errorCorrectionLevel: 'H',
      margin: 4,
      width: 420,
    });
  }

  verifyVnPayReturn(queryParams: any) {
    const vnp = this.getVnpConfig();
    const secureHash = String(queryParams?.vnp_SecureHash || '');

    const input: Record<string, any> = { ...queryParams };
    delete input.vnp_SecureHash;
    delete input.vnp_SecureHashType;

    const sortedKeys = Object.keys(input).sort();
    const hashData = sortedKeys
      .map((k) => `${this.vnpEncode(k)}=${this.vnpEncode(String(input[k]))}`)
      .join('&');

    const check = crypto.createHmac('sha512', vnp.hashSecret).update(hashData).digest('hex');

    const valid = check.toLowerCase() === secureHash.toLowerCase();

    return {
      valid,
      code: input.vnp_TxnRef,
      responseCode: input.vnp_ResponseCode,
      transactionNo: input.vnp_TransactionNo,
      raw: input,
    };
  }

  // urlencode kiểu VNPAY: space => +
  private vnpEncode(s: string) {
    return encodeURIComponent(s).replace(/%20/g, '+');
  }

  private formatDate(d: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(
      d.getMinutes(),
    )}${pad(d.getSeconds())}`;
  }
}
