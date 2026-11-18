'use strict';

function parseHttpsEndpoint(raw, env, label) {
  let url;
  try { url = new URL(raw); } catch {
    return { error: { ok: false, statusCode: 503, code: 'integration_not_configured', message: `Địa chỉ kết nối ${label} không hợp lệ.` } };
  }
  if (env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    return { error: { ok: false, statusCode: 503, code: 'integration_not_configured', message: `${label} bắt buộc dùng HTTPS trong môi trường vận hành.` } };
  }
  return { url };
}

function safeFeeVnd(value) {
  const num = Math.round(Number(value));
  return Number.isSafeInteger(num) && num >= 0 ? String(num) : '0';
}

async function createShippingOrder(provider, order, shippingInput = {}, env = process.env) {
  if (provider === 'ghn' && (!env.GHN_TOKEN || !env.GHN_SHOP_ID)) {
    return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn khóa Giao Hàng Nhanh (GHN_TOKEN và GHN_SHOP_ID).' };
  }
  if (provider === 'ghtk' && !env.GHTK_TOKEN) {
    return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn token Giao Hàng Tiết Kiệm (GHTK_TOKEN).' };
  }
  if (!['ghn', 'ghtk'].includes(provider)) {
    return { ok: false, statusCode: 400, code: 'unsupported_provider', message: 'Hãy chọn đơn vị vận chuyển GHN hoặc GHTK.' };
  }

  const receiverName = String(shippingInput.receiverName || '').trim();
  const receiverPhone = String(shippingInput.receiverPhone || '').trim();
  const address = String(shippingInput.address || '').trim();
  if (!receiverName || receiverName.length > 120 || !receiverPhone || receiverPhone.length > 30 || !address || address.length > 300) {
    return { ok: false, statusCode: 400, code: 'validation_error', message: 'Tên, số điện thoại hoặc địa chỉ người nhận không hợp lệ (hoặc còn thiếu).' };
  }
  const codRaw = shippingInput.codAmountVnd == null ? 0 : Number(shippingInput.codAmountVnd);
  const weightRaw = shippingInput.weightGram == null ? 500 : Number(shippingInput.weightGram);
  if (!Number.isSafeInteger(codRaw) || codRaw < 0 || codRaw > 1000000000 || !Number.isSafeInteger(weightRaw) || weightRaw < 50 || weightRaw > 500000) {
    return { ok: false, statusCode: 400, code: 'validation_error', message: 'Tiền thu hộ COD hoặc khối lượng (50g–500kg) không hợp lệ.' };
  }

  if (provider === 'ghn') {
    const defaultGhn = env.NODE_ENV === 'production'
      ? 'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create'
      : 'https://dev-online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create';
    const parsed = parseHttpsEndpoint(env.GHN_ENDPOINT || env.GHN_API_URL || defaultGhn, env, 'GHN');
    if (parsed.error) return parsed.error;
    let res;
    try {
      res = await fetch(parsed.url, {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json', Token: env.GHN_TOKEN, ShopId: String(env.GHN_SHOP_ID) },
        body: JSON.stringify({
          to_name: receiverName,
          to_phone: receiverPhone,
          to_address: address,
          to_ward_code: String(shippingInput.wardCode || '').slice(0, 32),
          to_district_id: Math.max(0, Math.trunc(Number(shippingInput.districtId) || 0)),
          cod_amount: codRaw,
          weight: Math.max(100, weightRaw),
          service_type_id: 2,
          payment_type_id: 2,
          required_note: 'CHOXEMHANGKHONGTHU',
          client_order_code: order.order_number,
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { ok: false, statusCode: 502, code: 'provider_unreachable', message: 'Không kết nối được tới Giao Hàng Nhanh.' };
    }
    const json = await res.json().catch(() => ({}));
    const trackingCode = String(json?.data?.order_code || '').trim();
    if (!res.ok || json.code !== 200 || !trackingCode) {
      return { ok: false, statusCode: 502, code: 'shipping_provider_error', message: 'GHN không tạo được vận đơn. Kiểm tra lại địa chỉ hoặc cấu hình shop.' };
    }
    return {
      ok: true,
      trackingCode,
      feeVnd: safeFeeVnd(json?.data?.total_fee),
      status: 'ready_to_pick',
    };
  }

  const parsed = parseHttpsEndpoint(env.GHTK_ENDPOINT || env.GHTK_API_URL || 'https://services.giaohangtietkiem.vn/services/shipment/order', env, 'GHTK');
  if (parsed.error) return parsed.error;
  let res;
  try {
    res = await fetch(parsed.url, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', Token: env.GHTK_TOKEN },
      body: JSON.stringify({
        order: {
          id: order.order_number,
          name: receiverName,
          tel: receiverPhone,
          address,
          province: String(shippingInput.province || '').slice(0, 80),
          district: String(shippingInput.district || '').slice(0, 80),
          ward: String(shippingInput.ward || '').slice(0, 80),
          hamlet: 'Khác',
          pick_money: codRaw,
          value: Number(order.total_vnd),
        },
        products: (order.lines || []).map((l) => ({ name: l.product_name_snapshot, weight: 0.3, quantity: Number(l.quantity) })),
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, statusCode: 502, code: 'provider_unreachable', message: 'Không kết nối được tới Giao Hàng Tiết Kiệm.' };
  }
  const json = await res.json().catch(() => ({}));
  const trackingCode = String(json?.order?.label || '').trim();
  if (!res.ok || !json.success || !trackingCode) {
    return { ok: false, statusCode: 502, code: 'shipping_provider_error', message: 'GHTK không tạo được vận đơn. Kiểm tra lại địa chỉ hoặc tài khoản.' };
  }
  return {
    ok: true,
    trackingCode,
    feeVnd: safeFeeVnd(json?.order?.fee),
    status: 'ready_to_pick',
  };
}

module.exports = { createShippingOrder };
