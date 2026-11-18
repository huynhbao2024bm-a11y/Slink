'use strict';

const shopCache = new Map();

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

function parseVietnameseAddressParts(rawAddress, explicit = {}, fallbackDefaults = {}) {
  const address = String(rawAddress || '').trim();
  const parts = address.split(',').map((s) => s.trim()).filter(Boolean);
  const wardName = String(explicit.wardName || (parts.length >= 3 ? parts[parts.length - 3] : '') || fallbackDefaults.wardName || 'Phường Bến Nghé').trim().slice(0, 80);
  const districtName = String(explicit.districtName || (parts.length >= 3 ? parts[parts.length - 2] : '') || fallbackDefaults.districtName || 'Quận 1').trim().slice(0, 80);
  const provinceName = String(explicit.provinceName || (parts.length >= 3 ? parts[parts.length - 1] : '') || fallbackDefaults.provinceName || 'Hồ Chí Minh').trim().slice(0, 80);
  return {
    fullAddress: address || fallbackDefaults.fullAddress || '72 Lê Thánh Tôn, Phường Bến Nghé, Quận 1, Hồ Chí Minh',
    wardName,
    districtName,
    provinceName,
  };
}

function resolveGhnEndpoints(env = process.env) {
  const custom = env.GHN_ENDPOINT || env.GHN_API_URL || '';
  if (custom) {
    const parsed = parseHttpsEndpoint(custom, env, 'GHN');
    if (parsed.error) return parsed;
    const origin = parsed.url.origin;
    const createUrl = parsed.url.pathname && parsed.url.pathname !== '/'
      ? parsed.url.toString()
      : `${origin}/shiip/public-api/v2/shipping-order/create`;
    return {
      origin,
      createUrl,
      previewUrl: `${origin}/shiip/public-api/v2/shipping-order/preview`,
      shopListUrl: `${origin}/shiip/public-api/v2/shop/all`,
    };
  }
  const origin = env.GHN_SANDBOX === 'true'
    ? 'https://dev-online-gateway.ghn.vn'
    : 'https://online-gateway.ghn.vn';
  return {
    origin,
    createUrl: `${origin}/shiip/public-api/v2/shipping-order/create`,
    previewUrl: `${origin}/shiip/public-api/v2/shipping-order/preview`,
    shopListUrl: `${origin}/shiip/public-api/v2/shop/all`,
  };
}

async function verifyGhnConnection(env = process.env) {
  const token = String(env.GHN_TOKEN || '').trim();
  if (!token) {
    return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn khóa Giao Hàng Nhanh (GHN_TOKEN).' };
  }
  const endpoints = resolveGhnEndpoints(env);
  if (endpoints.error) return endpoints.error;

  let res;
  try {
    res = await fetch(endpoints.shopListUrl, {
      method: 'POST',
      redirect: 'error',
      headers: { 'content-type': 'application/json', Token: token },
      body: JSON.stringify({ offset: 0, limit: 20, client_phone: '' }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, statusCode: 502, code: 'provider_unreachable', message: 'Không kết nối được tới cổng Giao Hàng Nhanh.' };
  }
  const json = await res.json().catch(() => ({}));
  const shops = Array.isArray(json?.data?.shops) ? json.data.shops : [];
  if (!res.ok || json.code !== 200) {
    return { ok: false, statusCode: 502, code: 'ghn_auth_failed', message: json?.message || 'GHN_TOKEN không hợp lệ hoặc đã hết hạn.' };
  }
  const configuredShopId = String(env.GHN_SHOP_ID || '').trim();
  const matched = (configuredShopId && shops.find((s) => String(s._id) === configuredShopId)) || shops[0] || null;
  if (!matched && !configuredShopId) {
    return { ok: false, statusCode: 502, code: 'ghn_shop_missing', message: 'Tài khoản GHN chưa có cửa hàng (ShopId) nào được tạo.' };
  }
  const resolved = {
    shopId: configuredShopId || String(matched._id),
    shopName: String(matched?.name || 'Cửa hàng GHN'),
    phone: String(matched?.phone || ''),
    address: String(matched?.address || ''),
    wardCode: String(matched?.ward_code || ''),
    districtId: Number(matched?.district_id || 0),
    shopCount: shops.length,
  };
  shopCache.set(`${endpoints.origin}:${token}`, resolved);
  return { ok: true, ...resolved };
}

async function resolveGhnShopInfo(env = process.env) {
  const token = String(env.GHN_TOKEN || '').trim();
  const explicitShopId = String(env.GHN_SHOP_ID || '').trim();
  if (explicitShopId) {
    return { ok: true, shopId: explicitShopId, shopName: '', phone: '', address: '', wardCode: '', districtId: 0 };
  }
  const endpoints = resolveGhnEndpoints(env);
  if (endpoints.error) return endpoints.error;
  const cacheKey = `${endpoints.origin}:${token}`;
  if (shopCache.has(cacheKey)) return { ok: true, ...shopCache.get(cacheKey) };
  return verifyGhnConnection(env);
}

function validateShippingInput(shippingInput = {}) {
  const receiverName = String(shippingInput.receiverName || '').trim();
  const receiverPhone = String(shippingInput.receiverPhone || '').trim();
  const address = String(shippingInput.address || '').trim();
  if (!receiverName || receiverName.length > 120 || !receiverPhone || receiverPhone.length > 30 || !address || address.length > 300) {
    return { error: { ok: false, statusCode: 400, code: 'validation_error', message: 'Tên, số điện thoại hoặc địa chỉ người nhận không hợp lệ (hoặc còn thiếu).' } };
  }
  const codRaw = shippingInput.codAmountVnd == null ? 0 : Number(shippingInput.codAmountVnd);
  const weightRaw = shippingInput.weightGram == null ? 500 : Number(shippingInput.weightGram);
  if (!Number.isSafeInteger(codRaw) || codRaw < 0 || codRaw > 1000000000 || !Number.isSafeInteger(weightRaw) || weightRaw < 50 || weightRaw > 500000) {
    return { error: { ok: false, statusCode: 400, code: 'validation_error', message: 'Tiền thu hộ COD hoặc khối lượng (50g–500kg) không hợp lệ.' } };
  }
  return { receiverName, receiverPhone, address, codRaw, weightRaw };
}

function buildGhnPayload(order, validated, shippingInput = {}, storeProfile = {}, shopInfo = {}) {
  const toParts = parseVietnameseAddressParts(validated.address, {
    wardName: shippingInput.wardName || shippingInput.ward,
    districtName: shippingInput.districtName || shippingInput.district,
    provinceName: shippingInput.provinceName || shippingInput.province,
  });
  const fromParts = parseVietnameseAddressParts(storeProfile.address || shopInfo.address || '', {
    wardName: shippingInput.fromWardName,
    districtName: shippingInput.fromDistrictName,
    provinceName: shippingInput.fromProvinceName,
  });
  const rawPhone = String(storeProfile.phone || shopInfo.phone || '').replace(/[^\d+]/g, '');
  const fromPhone = /^0\d{9,10}$/.test(rawPhone) ? rawPhone : (/^0\d{9,10}$/.test(String(shopInfo.phone || '')) ? String(shopInfo.phone) : '0901234567');
  const fromName = String(storeProfile.name || shopInfo.shopName || 'Cửa hàng Slink').trim().slice(0, 120) || 'Cửa hàng Slink';
  const weight = Math.max(100, validated.weightRaw);
  const lines = Array.isArray(order.lines) && order.lines.length
    ? order.lines.map((l) => ({
      name: String(l.product_name_snapshot || 'Hàng hóa').slice(0, 120),
      quantity: Math.max(1, Math.round(Number(l.quantity) || 1)),
      price: Math.max(0, Math.round(Number(l.unit_price_vnd || 0))),
      weight: Math.max(50, Math.round(weight / order.lines.length)),
    }))
    : [{ name: `Đơn hàng ${order.order_number}`, quantity: 1, price: Math.max(0, Math.round(Number(order.total_vnd || 0))), weight }];

  const payload = {
    payment_type_id: 2,
    note: String(shippingInput.note || `Đơn hàng ${order.order_number}`).slice(0, 200),
    required_note: ['CHOTHUHANG', 'CHOXEMHANGKHONGTHU', 'KHONGCHOXEMHANG'].includes(shippingInput.requiredNote)
      ? shippingInput.requiredNote
      : 'CHOXEMHANGKHONGTHU',
    from_name: fromName,
    from_phone: fromPhone,
    from_address: fromParts.fullAddress,
    from_ward_name: fromParts.wardName,
    from_district_name: fromParts.districtName,
    from_province_name: fromParts.provinceName,
    to_name: validated.receiverName,
    to_phone: validated.receiverPhone,
    to_address: toParts.fullAddress,
    to_ward_name: toParts.wardName,
    to_district_name: toParts.districtName,
    to_province_name: toParts.provinceName,
    cod_amount: validated.codRaw,
    weight,
    length: 20,
    width: 15,
    height: 10,
    service_type_id: 2,
    client_order_code: String(order.order_number || ''),
    items: lines,
  };
  const wardCode = String(shippingInput.wardCode || '').trim().slice(0, 32);
  const districtId = Math.max(0, Math.trunc(Number(shippingInput.districtId) || 0));
  if (wardCode) payload.to_ward_code = wardCode;
  if (districtId > 0) payload.to_district_id = districtId;
  return payload;
}

async function previewShippingOrder(provider, order, shippingInput = {}, env = process.env, storeProfile = {}) {
  if (provider !== 'ghn') {
    return { ok: false, statusCode: 400, code: 'unsupported_provider', message: 'Tính năng xem trước phí hiện hỗ trợ Giao Hàng Nhanh (GHN).' };
  }
  if (!String(env.GHN_TOKEN || '').trim()) {
    return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn khóa Giao Hàng Nhanh (GHN_TOKEN).' };
  }
  const validated = validateShippingInput(shippingInput);
  if (validated.error) return validated.error;

  const endpoints = resolveGhnEndpoints(env);
  if (endpoints.error) return endpoints.error;
  const shopInfo = await resolveGhnShopInfo(env);
  if (!shopInfo.ok) return shopInfo;

  const payload = buildGhnPayload(order, validated, shippingInput, storeProfile, shopInfo);
  let res;
  try {
    res = await fetch(endpoints.previewUrl, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        Token: String(env.GHN_TOKEN).trim(),
        ShopId: String(shopInfo.shopId),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, statusCode: 502, code: 'provider_unreachable', message: 'Không kết nối được tới Giao Hàng Nhanh.' };
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 200 || !json.data) {
    const detail = json?.code_message_value || json?.message || 'Kiểm tra lại địa chỉ phường/xã, quận/huyện, tỉnh/thành.';
    return { ok: false, statusCode: 502, code: 'shipping_provider_error', message: `GHN chưa tính được phí: ${detail}` };
  }
  return {
    ok: true,
    provider: 'ghn',
    shopId: String(shopInfo.shopId),
    feeVnd: safeFeeVnd(json.data.total_fee),
    expectedDeliveryTime: String(json.data.expected_delivery_time || ''),
    sortCode: String(json.data.sort_code || ''),
  };
}

async function createShippingOrder(provider, order, shippingInput = {}, env = process.env, storeProfile = {}) {
  if (provider === 'ghn' && !String(env.GHN_TOKEN || '').trim()) {
    return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn khóa Giao Hàng Nhanh (GHN_TOKEN).' };
  }
  if (provider === 'ghtk' && !String(env.GHTK_TOKEN || '').trim()) {
    return { ok: false, statusCode: 503, code: 'integration_not_configured', message: 'Chưa gắn token Giao Hàng Tiết Kiệm (GHTK_TOKEN).' };
  }
  if (!['ghn', 'ghtk'].includes(provider)) {
    return { ok: false, statusCode: 400, code: 'unsupported_provider', message: 'Hãy chọn đơn vị vận chuyển GHN hoặc GHTK.' };
  }

  const validated = validateShippingInput(shippingInput);
  if (validated.error) return validated.error;

  if (provider === 'ghn') {
    const endpoints = resolveGhnEndpoints(env);
    if (endpoints.error) return endpoints.error;
    const shopInfo = await resolveGhnShopInfo(env);
    if (!shopInfo.ok) return shopInfo;

    const payload = buildGhnPayload(order, validated, shippingInput, storeProfile, shopInfo);
    let res;
    try {
      res = await fetch(endpoints.createUrl, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          Token: String(env.GHN_TOKEN).trim(),
          ShopId: String(shopInfo.shopId),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { ok: false, statusCode: 502, code: 'provider_unreachable', message: 'Không kết nối được tới Giao Hàng Nhanh.' };
    }
    const json = await res.json().catch(() => ({}));
    const trackingCode = String(json?.data?.order_code || '').trim();
    if (!res.ok || json.code !== 200 || !trackingCode) {
      const detail = json?.code_message_value || json?.message || 'Kiểm tra lại địa chỉ hoặc cấu hình shop.';
      return { ok: false, statusCode: 502, code: 'shipping_provider_error', message: `GHN không tạo được vận đơn: ${detail}` };
    }
    return {
      ok: true,
      trackingCode,
      feeVnd: safeFeeVnd(json?.data?.total_fee),
      expectedDeliveryTime: String(json?.data?.expected_delivery_time || ''),
      status: 'ready_to_pick',
    };
  }

  const toParts = parseVietnameseAddressParts(validated.address, {
    wardName: shippingInput.wardName || shippingInput.ward,
    districtName: shippingInput.districtName || shippingInput.district,
    provinceName: shippingInput.provinceName || shippingInput.province,
  });
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
          name: validated.receiverName,
          tel: validated.receiverPhone,
          address: toParts.fullAddress,
          province: toParts.provinceName,
          district: toParts.districtName,
          ward: toParts.wardName,
          hamlet: 'Khác',
          pick_money: validated.codRaw,
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

module.exports = {
  createShippingOrder,
  previewShippingOrder,
  verifyGhnConnection,
  parseVietnameseAddressParts,
};
