'use strict';

const { assertSafeOutboundUrl } = require('./safe-url');

function parseHttpsProviderUrl(raw, env, label) {
  try {
    return {
      url: assertSafeOutboundUrl(raw, { allowLocalInTest: env.NODE_ENV === 'test', label }),
    };
  } catch (err) {
    return {
      error: { ok: false, statusCode: 503, code: 'integration_not_configured', message: err.message || `Địa chỉ kết nối ${label} không hợp lệ.` },
    };
  }
}

function buildEinvoicePayload(order, storeConfig) {
  return {
    taxCode: storeConfig.tax_code,
    templateCode: storeConfig.einvoice_template_code || '1C25TYY',
    invoiceSeries: storeConfig.einvoice_serial || 'C25TSL',
    refOrderId: order.id,
    orderNumber: order.order_number,
    currency: 'VND',
    totalVnd: String(order.total_vnd),
    discountVnd: String(order.discount_vnd || '0'),
    buyerName: order.customer_name || 'Khach le khong lay hoa don',
    buyerPhone: order.customer_phone || '',
    items: (order.lines || []).map((l) => ({
      sku: l.sku_snapshot,
      name: l.product_name_snapshot,
      unit: l.unit_snapshot,
      quantity: Number(l.quantity),
      unitPriceVnd: String(l.unit_price_vnd),
      lineTotalVnd: String(l.line_total_vnd),
    })),
  };
}

async function issueEinvoice(provider, order, storeConfig, env = process.env) {
  if (!storeConfig.tax_code) {
    return { ok: false, statusCode: 400, code: 'missing_tax_code', message: 'Hãy nhập Mã số thuế cửa hàng trong Cài đặt tích hợp trước khi phát hành hóa đơn điện tử.' };
  }
  const payload = buildEinvoicePayload(order, storeConfig);
  if (provider === 'misa') {
    if (!env.MISA_EINVOICE_URL || !env.MISA_APP_ID || !env.MISA_SECRET) {
      return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn tài khoản MISA meInvoice (MISA_EINVOICE_URL, MISA_APP_ID, MISA_SECRET).' };
    }
    const parsed = parseHttpsProviderUrl(env.MISA_EINVOICE_URL, env, 'MISA meInvoice');
    if (parsed.error) return parsed.error;
    let res;
    try {
      res = await fetch(parsed.url, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', 'x-app-id': env.MISA_APP_ID, authorization: `Bearer ${env.MISA_SECRET}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { ok: false, statusCode: 502, code: 'provider_unreachable', message: 'Không kết nối được tới máy chủ MISA meInvoice.' };
    }
    const data = await res.json().catch(() => ({}));
    const invoiceNumber = String(data?.invoiceNumber || '').trim();
    if (!res.ok || !invoiceNumber) return { ok: false, statusCode: 502, code: 'provider_error', message: 'MISA meInvoice chưa phát hành được hóa đơn.' };
    return { ok: true, invoiceNumber, lookupCode: String(data?.lookupCode || '').trim() };
  }

  if (provider === 'viettel') {
    if (!env.VIETTEL_EINVOICE_URL || !env.VIETTEL_EINVOICE_USER || !env.VIETTEL_EINVOICE_PASS) {
      return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn tài khoản Viettel S-Invoice (VIETTEL_EINVOICE_URL, VIETTEL_EINVOICE_USER, VIETTEL_EINVOICE_PASS).' };
    }
    const parsed = parseHttpsProviderUrl(env.VIETTEL_EINVOICE_URL, env, 'Viettel S-Invoice');
    if (parsed.error) return parsed.error;
    const authHdr = 'Basic ' + Buffer.from(`${env.VIETTEL_EINVOICE_USER}:${env.VIETTEL_EINVOICE_PASS}`).toString('base64');
    let res;
    try {
      res = await fetch(parsed.url, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', authorization: authHdr },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { ok: false, statusCode: 502, code: 'provider_unreachable', message: 'Không kết nối được tới máy chủ Viettel S-Invoice.' };
    }
    const data = await res.json().catch(() => ({}));
    const invoiceNumber = String(data?.result?.invoiceNo || data?.invoiceNo || '').trim();
    if (!res.ok || !invoiceNumber) return { ok: false, statusCode: 502, code: 'provider_error', message: 'Viettel S-Invoice chưa phát hành được hóa đơn.' };
    return { ok: true, invoiceNumber, lookupCode: String(data?.result?.reservationCode || '').trim() };
  }

  return { ok: false, statusCode: 400, code: 'unsupported_provider', message: 'Hãy chọn nhà cung cấp Hóa đơn điện tử (MISA hoặc Viettel).' };
}

module.exports = { buildEinvoicePayload, issueEinvoice };
