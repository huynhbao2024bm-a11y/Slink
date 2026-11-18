'use strict';

const { createHash, createHmac, timingSafeEqual } = require('node:crypto');

function safeCompareText(a, b) {
  const s1 = String(a || '');
  const s2 = String(b || '');
  if (!s1 || !s2) return false;
  const h1 = createHash('sha256').update(s1, 'utf8').digest();
  const h2 = createHash('sha256').update(s2, 'utf8').digest();
  return timingSafeEqual(h1, h2);
}

function normalizeOccurredAt(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return new Date().toISOString();
  const naive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(txt)
    ? `${txt.replace(' ', 'T')}+07:00`
    : txt;
  const dt = new Date(naive);
  return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

function extractOrderCodeFromMemo(memo) {
  const text = String(memo || '').toUpperCase();
  const explicit = /\bSLINK[\s\-_#:]*([A-Z]{1,6}-?\d{1,12}(?:-[A-Z0-9]{1,12})*)\b/.exec(text);
  if (explicit) return explicit[1];
  const sl = /\b((?:SL|DH|HD|ORD)-?\d{1,12})\b/.exec(text);
  if (sl) return sl[1];
  return null;
}

function verifyAndParseBankWebhook(provider, requestHeaders, body, env = process.env) {
  const name = String(provider || '').toLowerCase();
  if (!['sepay', 'casso', 'payos'].includes(name)) {
    return { configured: false, valid: false, statusCode: 400, code: 'unsupported_provider', message: 'Cổng đối soát ngân hàng không hợp lệ.' };
  }

  if (name === 'sepay') {
    const secret = String(env.SEPAY_WEBHOOK_TOKEN || '').trim();
    if (!secret) return { configured: false, valid: false, statusCode: 503, code: 'integration_not_configured', message: 'Cổng đối soát ngân hàng chưa được kích hoạt.' };
    const auth = String(requestHeaders?.authorization || '');
    const m = /^(?:Apikey|Bearer)\s+(.+)$/i.exec(auth);
    const token = m ? m[1].trim() : '';
    if (!safeCompareText(token, secret)) {
      return { configured: true, valid: false, statusCode: 401, code: 'invalid_webhook_signature', message: 'Mã xác thực SePay không hợp lệ.' };
    }
    const direction = String(body?.transferType || 'in').toLowerCase();
    if (direction !== 'in') return { configured: true, valid: true, ignore: true, reason: 'outbound_transfer' };
    const amountRaw = String(Math.round(Number(body?.transferAmount || 0)));
    if (!/^[1-9]\d{0,15}$/.test(amountRaw)) return { configured: true, valid: true, ignore: true, reason: 'invalid_amount' };
    const eventId = String(body?.id || body?.referenceCode || '').trim();
    if (!eventId) return { configured: true, valid: false, statusCode: 400, code: 'missing_event_id', message: 'Thiếu mã giao dịch SePay.' };
    const memo = String(body?.content || body?.description || '');
    return {
      configured: true,
      valid: true,
      events: [{
        externalEventId: `sepay:${eventId}`,
        bankAccountNumber: String(body?.accountNumber || body?.subAccount || '').trim(),
        amountVnd: amountRaw,
        memo,
        orderNumber: extractOrderCodeFromMemo(memo),
        occurredAt: normalizeOccurredAt(body?.transactionDate),
      }],
    };
  }

  if (name === 'casso') {
    const secret = String(env.CASSO_SECURE_TOKEN || '').trim();
    if (!secret) return { configured: false, valid: false, statusCode: 503, code: 'integration_not_configured', message: 'Cổng đối soát ngân hàng chưa được kích hoạt.' };
    const hdr = String(requestHeaders?.['secure-token'] || requestHeaders?.['x-webhook-token'] || '').trim();
    if (!safeCompareText(hdr, secret)) {
      return { configured: true, valid: false, statusCode: 401, code: 'invalid_webhook_signature', message: 'Secure token Casso không hợp lệ.' };
    }
    const rows = Array.isArray(body?.data) ? body.data : [];
    const events = [];
    for (const row of rows) {
      const amountNum = Number(row?.amount || 0);
      if (!Number.isSafeInteger(amountNum) || amountNum <= 0) continue;
      const tid = String(row?.tid || row?.id || '').trim();
      if (!tid) continue;
      const memo = String(row?.description || '');
      events.push({
        externalEventId: `casso:${tid}`,
        bankAccountNumber: String(row?.bankSubAccId || row?.accountNumber || '').trim(),
        amountVnd: String(amountNum),
        memo,
        orderNumber: extractOrderCodeFromMemo(memo),
        occurredAt: normalizeOccurredAt(row?.when),
      });
    }
    return { configured: true, valid: true, events };
  }

  // PayOS checksum verification: HMAC-SHA256 over alphabetically sorted key=value pairs of body.data
  const checksumKey = String(env.PAYOS_CHECKSUM_KEY || '').trim();
  if (!checksumKey) return { configured: false, valid: false, statusCode: 503, code: 'integration_not_configured', message: 'Cổng đối soát ngân hàng chưa được kích hoạt.' };
  const data = body?.data;
  const sig = String(body?.signature || '').toLowerCase();
  if (!data || typeof data !== 'object' || Array.isArray(data) || !sig) {
    return { configured: true, valid: false, statusCode: 400, code: 'invalid_payload', message: 'Dữ liệu webhook PayOS không hợp lệ.' };
  }
  const canonical = Object.keys(data).sort().map((k) => {
    const v = data[k];
    if (v == null) return `${k}=`;
    return `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`;
  }).join('&');
  const expected = createHmac('sha256', checksumKey).update(canonical).digest('hex').toLowerCase();
  if (!safeCompareText(sig, expected)) {
    return { configured: true, valid: false, statusCode: 401, code: 'invalid_webhook_signature', message: 'Chữ ký PayOS không khớp.' };
  }
  if (body?.code !== '00' || body?.success !== true) {
    return { configured: true, valid: true, ignore: true, reason: 'non_success_payos' };
  }
  const amountRaw = String(Math.round(Number(data.amount || 0)));
  if (!/^[1-9]\d{0,15}$/.test(amountRaw)) return { configured: true, valid: true, ignore: true, reason: 'invalid_amount' };
  const ref = String(data.reference || data.orderCode || '').trim();
  if (!ref) return { configured: true, valid: false, statusCode: 400, code: 'missing_event_id', message: 'Thiếu mã giao dịch PayOS.' };
  const memo = String(data.description || data.orderCode || '');
  return {
    configured: true,
    valid: true,
    events: [{
      externalEventId: `payos:${ref}`,
      bankAccountNumber: String(data.accountNumber || '').trim(),
      amountVnd: amountRaw,
      memo,
      orderNumber: extractOrderCodeFromMemo(memo),
      occurredAt: normalizeOccurredAt(data.transactionDateTime),
    }],
  };
}

module.exports = { safeCompareText, extractOrderCodeFromMemo, verifyAndParseBankWebhook };
