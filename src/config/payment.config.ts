import { registerAs } from '@nestjs/config';

export default registerAs('payment', () => ({
  vnp: {
    tmnCode: process.env.VNPAY_TMN_CODE!,
    hashSecret: process.env.VNPAY_HASH_SECRET!,
    endpoint: process.env.VNPAY_ENDPOINT!,
    returnUrl: process.env.VNPAY_RETURN_URL!,
    version: process.env.VNPAY_VERSION || '2.1.0',
    locale: process.env.VNPAY_LOCALE || 'vn',
    currency: process.env.VNPAY_CURRENCY || 'VND',
  },
}));
