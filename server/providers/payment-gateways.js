'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

function signMomoCreateRequest({ orderId, requestId, amountVnd, orderInfo, redirectUrl, ipnUrl, extraData = '', requestType = 'captureWallet' }, env = process.env) {
  const { MOMO_PARTNER_CODE, MOMO_ACCESS_KEY, MOMO_SECRET_KEY } = env;
  if (!MOMO_PARTNER_CODE || !MOMO_ACCESS_KEY || !MOMO_SECRET_KEY) {
    return { configured: false, missing: ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY'] };
  }
  const rawSignature =
    `accessKey=${MOMO_ACCESS_KEY}&amount=${amountVnd}&extraData=${extraData}` +
    `&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}` +
    `&partnerCode=${MOMO_PARTNER_CODE}&redirectUrl=${redirectUrl}` +
    `&requestId=${requestId}&requestType=${requestType}`;
  const signature = createHmac('sha256', MOMO_SECRET_KEY).update(rawSignature).digest('hex');
  return {
    configured: true,
    endpoint: env.MOMO_ENDPOINT || env.MOMO_API_URL || 'https://test-payment.momo.vn/v2/gateway/api/create',
    payload: {
      partnerCode: MOMO_PARTNER_CODE,
      requestType,
      ipnUrl,
      redirectUrl,
      orderId,
      amount: Number(amountVnd),
      orderInfo,
      requestId,
      extraData,
      lang: 'vi',
      signature,
    },
  };
}

function verifyMomoIpnSignature(body, env = process.env) {
  const { MOMO_ACCESS_KEY, MOMO_SECRET_KEY } = env;
  if (!MOMO_ACCESS_KEY || !MOMO_SECRET_KEY) return { configured: false, valid: false };
  const raw =
    `accessKey=${MOMO_ACCESS_KEY}&amount=${body?.amount ?? ''}&extraData=${body?.extraData ?? ''}` +
    `&message=${body?.message ?? ''}&orderId=${body?.orderId ?? ''}&orderInfo=${body?.orderInfo ?? ''}` +
    `&orderType=${body?.orderType ?? ''}&partnerCode=${body?.partnerCode ?? ''}&payType=${body?.payType ?? ''}` +
    `&requestId=${body?.requestId ?? ''}&responseTime=${body?.responseTime ?? ''}` +
    `&resultCode=${body?.resultCode ?? ''}&transId=${body?.transId ?? ''}`;
  const expected = createHmac('sha256', MOMO_SECRET_KEY).update(raw).digest('hex');
  const got = String(body?.signature || '');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(got, 'utf8');
  const partnerMatch = String(body?.partnerCode || '') === env.MOMO_PARTNER_CODE;
  return { configured: true, valid: partnerMatch && a.length > 0 && a.length === b.length && timingSafeEqual(a, b) };
}

function buildVnpayPaymentUrl({ txnRef, amountVnd, orderInfo, ipAddr = '127.0.0.1', returnUrl, createDate }, env = process.env) {
  const { VNPAY_TMN_CODE, VNPAY_HASH_SECRET } = env;
  if (!VNPAY_TMN_CODE || !VNPAY_HASH_SECRET) {
    return { configured: false, missing: ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET'] };
  }
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: VNPAY_TMN_CODE,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: txnRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: String(BigInt(amountVnd) * 100n),
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };
  const sortedKeys = Object.keys(params).sort();
  const query = sortedKeys.map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`).join('&');
  const secureHash = createHmac('sha512', VNPAY_HASH_SECRET).update(Buffer.from(query, 'utf8')).digest('hex');
  const baseUrl = env.VNPAY_ENDPOINT || env.VNPAY_API_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
  return { configured: true, url: `${baseUrl}?${query}&vnp_SecureHash=${secureHash}` };
}

function verifyVnpayIpn(queryObj, env = process.env) {
  const { VNPAY_TMN_CODE, VNPAY_HASH_SECRET } = env;
  if (!VNPAY_TMN_CODE || !VNPAY_HASH_SECRET) return { configured: false, valid: false };
  const input = { ...(queryObj || {}) };
  const got = String(input.vnp_SecureHash || '').toLowerCase();
  delete input.vnp_SecureHash;
  delete input.vnp_SecureHashType;
  const query = Object.keys(input).sort().map((k) => `${k}=${encodeURIComponent(input[k] ?? '').replace(/%20/g, '+')}`).join('&');
  const expected = createHmac('sha512', VNPAY_HASH_SECRET).update(Buffer.from(query, 'utf8')).digest('hex').toLowerCase();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(got, 'utf8');
  const tmnMatch = String(input.vnp_TmnCode || '') === VNPAY_TMN_CODE;
  return { configured: true, valid: tmnMatch && a.length > 0 && a.length === b.length && timingSafeEqual(a, b) };
}

module.exports = { signMomoCreateRequest, verifyMomoIpnSignature, buildVnpayPaymentUrl, verifyVnpayIpn };
