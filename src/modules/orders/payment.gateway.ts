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
  expireMinutes: number;
  debug: boolean;
};

@Injectable()
export class PaymentGatewayService {
  constructor(private readonly config: ConfigService) {}

  private getVnpConfig(): VnpConfig {
    const version =
      this.config.get<string>('VNPAY_VERSION') ||
      this.config.get<string>('VNP_VERSION') ||
      '2.1.0';

    const tmnCode =
      this.config.get<string>('VNPAY_TMN_CODE') ||
      this.config.get<string>('VNP_TMN_CODE') ||
      '';

    const hashSecret =
      this.config.get<string>('VNPAY_HASH_SECRET') ||
      this.config.get<string>('VNP_HASH_SECRET') ||
      '';

    const endpoint =
      this.config.get<string>('VNPAY_ENDPOINT') ||
      this.config.get<string>('VNP_ENDPOINT') ||
      '';

    const returnUrl =
      this.config.get<string>('VNPAY_RETURN_URL') ||
      this.config.get<string>('VNP_RETURN_URL') ||
      '';

    const locale =
      this.config.get<string>('VNPAY_LOCALE') ||
      this.config.get<string>('VNP_LOCALE') ||
      'vn';

    const currency =
      this.config.get<string>('VNPAY_CURRENCY') ||
      this.config.get<string>('VNP_CURRENCY') ||
      'VND';

    const expireMinutes = Number(
      this.config.get<string>('VNPAY_EXPIRE_MINUTES') ||
        this.config.get<string>('VNP_EXPIRE_MINUTES') ||
        '15',
    );

    const debug =
      String(this.config.get<string>('VNPAY_DEBUG') || '').toLowerCase() ===
      'true';

    const missing: string[] = [];

    if (!tmnCode) missing.push('VNPAY_TMN_CODE');
    if (!hashSecret) missing.push('VNPAY_HASH_SECRET');
    if (!endpoint) missing.push('VNPAY_ENDPOINT');
    if (!returnUrl) missing.push('VNPAY_RETURN_URL');

    if (missing.length > 0) {
      throw new BadRequestException(
        `VNPAY config missing: ${missing.join(', ')}`,
      );
    }

    return {
      version,
      tmnCode,
      hashSecret,
      endpoint,
      returnUrl,
      locale,
      currency,
      expireMinutes:
        Number.isFinite(expireMinutes) && expireMinutes > 0
          ? expireMinutes
          : 15,
      debug,
    };
  }

  createVnPayUrl(params: {
    code: string;
    amount: number;
    ipAddress: string;
    bankCode?: string;
  }) {
    const vnp = this.getVnpConfig();

    const amount = Number(params.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Số tiền thanh toán VNPAY không hợp lệ');
    }

    const now = new Date();
    const expire = new Date(now.getTime() + vnp.expireMinutes * 60 * 1000);

    const vnpParams: Record<string, string | number> = {
      vnp_Version: vnp.version,
      vnp_Command: 'pay',
      vnp_TmnCode: vnp.tmnCode,
      vnp_Locale: vnp.locale,
      vnp_CurrCode: vnp.currency,
      vnp_TxnRef: params.code,
      vnp_OrderInfo: `Thanh toan don hang ${params.code}`,
      vnp_OrderType: 'other',
      vnp_Amount: Math.round(amount * 100),
      vnp_ReturnUrl: vnp.returnUrl,
      vnp_IpAddr: this.normalizeIpAddress(params.ipAddress),
      vnp_CreateDate: this.formatVnpayDateVietnam(now),
      vnp_ExpireDate: this.formatVnpayDateVietnam(expire),
    };

    if (params.bankCode) {
      vnpParams.vnp_BankCode = params.bankCode;
    }

    const sortedKeys = Object.keys(vnpParams).sort();

    const hashData = sortedKeys
      .map(
        (key) =>
          `${this.vnpEncode(key)}=${this.vnpEncode(String(vnpParams[key]))}`,
      )
      .join('&');

    const secureHash = crypto
      .createHmac('sha512', vnp.hashSecret)
      .update(hashData)
      .digest('hex');

    const query = sortedKeys
      .map(
        (key) =>
          `${this.vnpEncode(key)}=${this.vnpEncode(String(vnpParams[key]))}`,
      )
      .concat([`vnp_SecureHash=${this.vnpEncode(secureHash)}`])
      .join('&');

    if (vnp.debug) {
      console.log('[VNPAY CREATE URL DEBUG]', {
        serverNowIso: now.toISOString(),
        serverTimezoneOffsetMinutes: now.getTimezoneOffset(),
        createDateVietnam: vnpParams.vnp_CreateDate,
        expireDateVietnam: vnpParams.vnp_ExpireDate,
        txnRef: vnpParams.vnp_TxnRef,
        amount: vnpParams.vnp_Amount,
        returnUrl: vnpParams.vnp_ReturnUrl,
        endpoint: vnp.endpoint,
        ipAddress: vnpParams.vnp_IpAddr,
      });
    }

    return `${vnp.endpoint}?${query}`;
  }

  async urlToQrDataUrl(url: string): Promise<string> {
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
      .map(
        (key) => `${this.vnpEncode(key)}=${this.vnpEncode(String(input[key]))}`,
      )
      .join('&');

    const check = crypto
      .createHmac('sha512', vnp.hashSecret)
      .update(hashData)
      .digest('hex');

    const valid = check.toLowerCase() === secureHash.toLowerCase();

    const amountRawValue =
      input.vnp_Amount != null ? Number(input.vnp_Amount) : undefined;

    const amount =
      typeof amountRawValue === 'number' && Number.isFinite(amountRawValue)
        ? amountRawValue / 100
        : undefined;

    if (vnp.debug) {
      console.log('[VNPAY RETURN DEBUG]', {
        valid,
        txnRef: input.vnp_TxnRef,
        responseCode: input.vnp_ResponseCode,
        amount,
        amountRaw: amountRawValue,
        payDate: input.vnp_PayDate,
        hasSecureHash: Boolean(secureHash),
      });
    }

    return {
      valid,
      code: input.vnp_TxnRef,
      responseCode: input.vnp_ResponseCode,
      transactionNo: input.vnp_TransactionNo,
      bankCode: input.vnp_BankCode,
      bankTranNo: input.vnp_BankTranNo,
      payDate: input.vnp_PayDate,
      amount,
      amountRaw: amountRawValue,
      raw: input,
    };
  }

  private normalizeIpAddress(ipAddress?: string) {
    const ip = String(ipAddress || '').trim();

    if (!ip) {
      return '127.0.0.1';
    }

    if (ip === '::1') {
      return '127.0.0.1';
    }

    if (ip.startsWith('::ffff:')) {
      return ip.replace('::ffff:', '');
    }

    return ip;
  }

  private vnpEncode(value: string) {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }

  /**
   * VNPAY cần thời gian dạng yyyyMMddHHmmss theo giờ Việt Nam.
   *
   * Local máy bạn thường là UTC+7 nên code cũ chạy bình thường.
   * AWS/server deploy thường là UTC nên code cũ bị lùi 7 tiếng,
   * dẫn tới VNPAY báo Error code=15.
   */
  private formatVnpayDateVietnam(date: Date) {
    const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);

    const yyyy = vietnamTime.getUTCFullYear().toString();
    const MM = String(vietnamTime.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(vietnamTime.getUTCDate()).padStart(2, '0');
    const HH = String(vietnamTime.getUTCHours()).padStart(2, '0');
    const mm = String(vietnamTime.getUTCMinutes()).padStart(2, '0');
    const ss = String(vietnamTime.getUTCSeconds()).padStart(2, '0');

    return `${yyyy}${MM}${dd}${HH}${mm}${ss}`;
  }
}