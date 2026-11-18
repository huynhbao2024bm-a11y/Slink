'use strict';

function hasNonEmpty(env, keys) {
  return keys.every((k) => typeof env[k] === 'string' && env[k].trim().length > 0);
}

function getIntegrationCatalog(env = process.env, storeConfig = {}) {
  const bankConfigured = Boolean(storeConfig.bank_bin && storeConfig.bank_account_number);
  const sepayReady = hasNonEmpty(env, ['SEPAY_WEBHOOK_TOKEN']);
  const cassoReady = hasNonEmpty(env, ['CASSO_SECURE_TOKEN']);
  const payosReady = hasNonEmpty(env, ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY']);
  const momoReady = hasNonEmpty(env, ['MOMO_PARTNER_CODE', 'MOMO_ACCESS_KEY', 'MOMO_SECRET_KEY']);
  const vnpayReady = hasNonEmpty(env, ['VNPAY_TMN_CODE', 'VNPAY_HASH_SECRET']);
  const misaReady = hasNonEmpty(env, ['MISA_EINVOICE_URL', 'MISA_APP_ID', 'MISA_SECRET']);
  const viettelEinvoiceReady = hasNonEmpty(env, ['VIETTEL_EINVOICE_URL', 'VIETTEL_EINVOICE_USER', 'VIETTEL_EINVOICE_PASS']);
  const ghnReady = hasNonEmpty(env, ['GHN_TOKEN']);
  const ghtkReady = hasNonEmpty(env, ['GHTK_TOKEN']);
  const vtpReady = hasNonEmpty(env, ['VTP_TOKEN']);
  const shopeeReady = hasNonEmpty(env, ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY']);
  const tiktokReady = hasNonEmpty(env, ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET']);
  const emailReady = hasNonEmpty(env, ['EMAIL_DELIVERY_URL', 'EMAIL_DELIVERY_TOKEN', 'EMAIL_FROM'])
    || hasNonEmpty(env, ['RESEND_API_KEY', 'EMAIL_FROM']);
  const zaloReady = hasNonEmpty(env, ['ZALO_OA_ACCESS_TOKEN', 'ZALO_ZNS_TEMPLATE_ID']);
  const sentryReady = hasNonEmpty(env, ['SENTRY_DSN']);

  return [
    {
      id: 'vietqr',
      category: 'payment',
      name: 'VietQR động (NAPAS EMVCo)',
      status: bankConfigured ? 'active' : 'needs_store_config',
      readyWithoutVendorKey: true,
      description: 'Tự sinh mã QR chuyển khoản chuẩn ngân hàng ngay tại POS và nhắc nợ, chạy offline 100%.',
      missingKeys: bankConfigured ? [] : ['bankBin (Chọn ngân hàng & STK ở bên dưới)'],
    },
    {
      id: 'escpos',
      category: 'hardware',
      name: 'Máy in bill nhiệt ESC/POS & Két tiền',
      status: 'active',
      readyWithoutVendorKey: true,
      description: 'Kết nối máy in USB/Serial (58mm/80mm) in thẳng 1 chạm và tự động bật két tiền mặt.',
      missingKeys: [],
    },
    {
      id: 'bank_webhook',
      category: 'payment',
      name: 'Tự động gạch nợ chuyển khoản (SePay / Casso / PayOS)',
      status: (sepayReady || cassoReady || payosReady) && bankConfigured ? 'configured' : 'needs_credentials',
      readyWithoutVendorKey: false,
      providers: { sepay: sepayReady, casso: cassoReady, payos: payosReady },
      description: 'Nhận thông báo biến động số dư qua Webhook để tự động gạch nợ đơn bán & ghi sổ quỹ.',
      missingKeys: (sepayReady || cassoReady || payosReady) ? [] : ['SEPAY_WEBHOOK_TOKEN hoặc CASSO_SECURE_TOKEN hoặc PAYOS_*'],
    },
    {
      id: 'ewallets',
      category: 'payment',
      name: 'Ví điện tử & Cổng thanh toán (MoMo / VNPAY)',
      status: (momoReady || vnpayReady) ? 'configured' : 'needs_credentials',
      readyWithoutVendorKey: false,
      providers: { momo: momoReady, vnpay: vnpayReady },
      description: 'Tạo mã QR đối tác MoMo/VNPAY và xác thực chữ ký IPN tự động.',
      missingKeys: (momoReady || vnpayReady) ? [] : ['MOMO_PARTNER_CODE / MOMO_ACCESS_KEY / MOMO_SECRET_KEY hoặc VNPAY_*'],
    },
    {
      id: 'einvoice',
      category: 'tax',
      name: 'Hóa đơn điện tử NĐ 123/70 (MISA / Viettel)',
      status: (misaReady || viettelEinvoiceReady) && Boolean(storeConfig.tax_code) ? 'configured' : 'needs_credentials',
      readyWithoutVendorKey: false,
      providers: { misa: misaReady, viettel: viettelEinvoiceReady },
      description: 'Phát hành & ký số hóa đơn điện tử khởi tạo từ máy tính tiền lên Cơ quan Thuế.',
      missingKeys: (misaReady || viettelEinvoiceReady) ? (storeConfig.tax_code ? [] : ['Mã số thuế (cấu hình tại cửa hàng)']) : ['MISA_EINVOICE_* hoặc VIETTEL_EINVOICE_*'],
    },
    {
      id: 'shipping',
      category: 'shipping',
      name: 'Đơn vị Vận chuyển (GHN / GHTK / Viettel Post)',
      status: (ghnReady || ghtkReady || vtpReady) ? 'configured' : 'needs_credentials',
      readyWithoutVendorKey: false,
      providers: { ghn: ghnReady, ghtk: ghtkReady, viettelpost: vtpReady },
      description: 'Tính cước tự động, đẩy đơn lấy mã vận đơn và cập nhật trạng thái giao / COD.',
      missingKeys: (ghnReady || ghtkReady || vtpReady) ? [] : ['GHN_TOKEN (ShopId tự nhận) hoặc GHTK_TOKEN hoặc VTP_TOKEN'],
    },
    {
      id: 'marketplaces',
      category: 'omnichannel',
      name: 'Sàn TMĐT (Shopee / TikTok Shop)',
      status: (shopeeReady || tiktokReady) ? 'configured' : 'needs_credentials',
      readyWithoutVendorKey: false,
      providers: { shopee: shopeeReady, tiktok: tiktokReady },
      description: 'Đồng bộ đơn sàn, tồn kho đa kênh và đối soát phí sàn tự động.',
      missingKeys: (shopeeReady || tiktokReady) ? [] : ['SHOPEE_PARTNER_ID + SHOPEE_PARTNER_KEY hoặc TIKTOK_APP_*'],
    },
    {
      id: 'comms',
      category: 'messaging',
      name: 'Email Giao dịch & Zalo ZNS CSKH',
      status: (emailReady || zaloReady) ? 'configured' : 'needs_credentials',
      readyWithoutVendorKey: false,
      providers: { email: emailReady, zaloZns: zaloReady },
      description: 'Gửi email xác nhận/biên lai (Resend/SMTP-HTTP) và nhắc nợ qua Zalo ZNS.',
      missingKeys: [...(emailReady ? [] : ['RESEND_API_KEY + EMAIL_FROM (hoặc EMAIL_DELIVERY_URL)']), ...(zaloReady ? [] : ['ZALO_OA_ACCESS_TOKEN'])],
    },
    {
      id: 'monitoring',
      category: 'ops',
      name: 'Giám sát lỗi & Vận hành (Sentry)',
      status: sentryReady ? 'configured' : 'needs_credentials',
      readyWithoutVendorKey: false,
      description: 'Báo cáo lỗi runtime & hiệu năng trên môi trường production.',
      missingKeys: sentryReady ? [] : ['SENTRY_DSN'],
    },
  ];
}

module.exports = { getIntegrationCatalog, hasNonEmpty };
