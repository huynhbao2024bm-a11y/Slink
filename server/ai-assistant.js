'use strict';

const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { hasPermission } = require('./rbac');

const SELL_ROLES = new Set(['owner', 'manager', 'cashier']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BASE64_LENGTH = 6_000_000;

function normalizeViText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, (m) => (m === 'Đ' ? 'D' : 'd'))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripJsonFences(rawText) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return '{}';
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

function safePositiveQuantity(rawQty) {
  const num = Number(String(rawQty ?? '').replace(',', '.').trim());
  if (!Number.isFinite(num) || num <= 0 || num > 10_000) return '1';
  const rounded = Math.round(num * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function safeNonNegativeVndText(rawVnd) {
  if (typeof rawVnd === 'bigint') return rawVnd >= 0n ? rawVnd.toString() : '0';
  if (typeof rawVnd === 'number') {
    if (!Number.isFinite(rawVnd) || rawVnd <= 0) return '0';
    return String(Math.round(rawVnd));
  }
  const digits = String(rawVnd ?? '').replace(/[^\d]/g, '');
  if (!digits) return '0';
  return BigInt(digits).toString();
}

function geminiEndpointUrls(env = {}) {
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  const explicitModel = String(env.GEMINI_MODEL || '').trim();
  const candidates = explicitModel
    ? [explicitModel, 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-flash-latest']
    : ['gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview', 'gemini-flash-latest', 'gemini-2.5-flash'];
  const uniqueModels = Array.from(new Set(candidates.filter(Boolean)));
  const encodedKey = encodeURIComponent(apiKey);
  const urls = uniqueModels.map(
    (m) => `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodedKey}`
  );
  if (apiKey.startsWith('AQ.')) {
    const primary = encodeURIComponent(uniqueModels[0]);
    urls.push(`https://aiplatform.googleapis.com/v1/publishers/google/models/${primary}:generateContent?key=${encodedKey}`);
  }
  return urls;
}

async function callGeminiJson(env, payload) {
  const apiKey = String(env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new ApiError(503, 'ai_unavailable', 'Trợ lý AI Gemini chưa được cấu hình GEMINI_API_KEY trên máy chủ.');
  }
  const urls = geminiEndpointUrls(env);
  let lastStatus = 502;
  for (let i = 0; i < urls.length; i += 1) {
    let response;
    try {
      response = await fetch(urls[i], {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ApiError(502, 'ai_network_error', 'Không kết nối được tới máy chủ Gemini AI. Vui lòng thử lại.');
    }
    lastStatus = response.status;
    if (response.ok) {
      const data = await response.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const rawText = (parts.find((p) => typeof p?.text === 'string') || {}).text || '{}';
      try {
        return JSON.parse(stripJsonFences(rawText));
      } catch {
        throw new ApiError(502, 'ai_bad_response', 'Phản hồi từ AI không đúng định dạng JSON.');
      }
    }
    if (i < urls.length - 1 && [400, 401, 403, 404, 503].includes(response.status)) {
      continue;
    }
    break;
  }
  if (lastStatus === 429) {
    throw new ApiError(429, 'ai_rate_limited', 'Gemini AI đang quá tải hoặc hết hạn mức phút này. Thử lại sau.');
  }
  throw new ApiError(502, 'ai_upstream_error', `Dịch vụ Gemini AI trả về lỗi (HTTP ${lastStatus}).`);
}

function matchProductFromList(products, candidateId, candidateName) {
  if (candidateId) {
    const byId = products.find((p) => p.id === candidateId);
    if (byId) return byId;
  }
  const needle = normalizeViText(candidateName);
  if (!needle) return null;
  const exact = products.find((p) => normalizeViText(p.name) === needle || normalizeViText(p.sku) === needle);
  if (exact) return exact;
  return products.find((p) => {
    const hay = normalizeViText(p.name);
    return hay && (hay.includes(needle) || needle.includes(hay));
  }) || null;
}

function matchCustomerFromList(customers, candidateId, candidateName) {
  if (candidateId) {
    const byId = customers.find((c) => c.id === candidateId);
    if (byId) return byId;
  }
  const needle = normalizeViText(candidateName);
  if (!needle || needle === 'khach le') return null;
  const exact = customers.find((c) => normalizeViText(c.name) === needle);
  if (exact) return exact;
  return customers.find((c) => {
    const hay = normalizeViText(c.name);
    return hay && (hay.includes(needle) || needle.includes(hay));
  }) || null;
}

function groundParsedOrder(parsed, products, customers) {
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const mergedByProductId = new Map();
  const unmatched = [];
  for (const row of rawItems.slice(0, 40)) {
    if (!row || typeof row !== 'object') continue;
    const rawName = String(row.matched_name || row.product_name || row.name || '').trim().slice(0, 120);
    const product = matchProductFromList(products, typeof row.product_id === 'string' ? row.product_id.trim() : '', rawName);
    if (!product) {
      if (rawName) unmatched.push({ name: rawName, quantity: safePositiveQuantity(row.quantity) });
      continue;
    }
    const qty = Number(safePositiveQuantity(row.quantity));
    const prev = mergedByProductId.get(product.id);
    if (prev) {
      prev.quantity = String(Math.round((Number(prev.quantity) + qty) * 1000) / 1000);
    } else {
      mergedByProductId.set(product.id, {
        productId: product.id,
        sku: product.sku || '',
        name: product.name,
        unit: product.unit || '',
        salePriceVnd: product.sale_price_vnd,
        quantity: String(qty),
      });
    }
  }
  const rawCustomerName = String(parsed?.customer_name || '').trim().slice(0, 120);
  const customer = matchCustomerFromList(
    customers,
    typeof parsed?.customer_id === 'string' ? parsed.customer_id.trim() : '',
    rawCustomerName
  );
  return {
    items: Array.from(mergedByProductId.values()),
    unmatched,
    customerId: customer ? customer.id : null,
    customerName: customer ? customer.name : (rawCustomerName && normalizeViText(rawCustomerName) !== 'khach le' ? rawCustomerName : ''),
    isDebt: Boolean(parsed?.is_debt),
    note: String(parsed?.note || '').trim().slice(0, 240),
  };
}

function groundParsedInvoice(parsed, products, suppliers) {
  const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
  const items = [];
  const unmatched = [];
  for (const row of rawItems.slice(0, 50)) {
    if (!row || typeof row !== 'object') continue;
    const rawName = String(row.product_name || row.matched_name || row.name || '').trim().slice(0, 140);
    const qty = safePositiveQuantity(row.quantity);
    const unitCostVnd = safeNonNegativeVndText(row.import_price_vnd ?? row.import_price ?? row.unit_cost_vnd);
    const product = matchProductFromList(products, typeof row.product_id === 'string' ? row.product_id.trim() : '', rawName);
    if (!product) {
      if (rawName) unmatched.push({ name: rawName, quantity: qty, unitCostVnd });
      continue;
    }
    items.push({
      productId: product.id,
      sku: product.sku || '',
      name: product.name,
      unit: product.unit || '',
      quantity: qty,
      unitCostVnd: unitCostVnd !== '0' ? unitCostVnd : (product.cost_vnd || '0'),
    });
  }
  const rawSupplierName = String(parsed?.supplier_name || '').trim().slice(0, 140);
  const supplierNeedle = normalizeViText(rawSupplierName);
  const supplier = supplierNeedle
    ? suppliers.find((s) => normalizeViText(s.name).includes(supplierNeedle) || supplierNeedle.includes(normalizeViText(s.name)))
    : null;
  return {
    supplierId: supplier ? supplier.id : null,
    supplierName: supplier ? supplier.name : rawSupplierName,
    items,
    unmatched,
  };
}

function registerAiAssistantRoutes(app, { pool, env, aiClient = null }) {
  app.get('/api/stores/:storeId/ai/status', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    await withStore(pool, auth.userId, storeId, async () => true);
    return {
      enabled: Boolean(aiClient || String(env.GEMINI_API_KEY || '').trim()),
      model: String(env.GEMINI_MODEL || 'gemini-3-flash-preview').trim() || 'gemini-3-flash-preview',
    };
  });

  app.post('/api/stores/:storeId/ai/parse-order', {
    config: { rateLimit: { max: 30, timeWindow: '15 minutes' } },
  }, async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const transcript = typeof request.body?.transcript === 'string' ? request.body.transcript.trim() : '';
    if (transcript.length < 2 || transcript.length > 1000) {
      throw new ApiError(400, 'validation_error', 'Hãy đọc hoặc nhập câu lệnh bán hàng (tối đa 1000 ký tự).');
    }

    const { products, customers } = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!SELL_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền lên đơn bán hàng.');
      }
      const prodRes = await client.query(
        `SELECT id, sku, name, unit, sale_price_vnd::text AS sale_price_vnd
         FROM products
         WHERE store_id = $1 AND status = 'active'
         ORDER BY updated_at DESC, name ASC
         LIMIT 400`,
        [storeId]
      );
      const custRes = await client.query(
        `SELECT id, name, phone
         FROM customers
         WHERE store_id = $1 AND status = 'active'
         ORDER BY updated_at DESC, name ASC
         LIMIT 200`,
        [storeId]
      );
      return { products: prodRes.rows, customers: custRes.rows };
    });

    const prompt = [
      'Bạn là trợ lý AI lên đơn cho phần mềm bán hàng Slink tại Việt Nam.',
      'Phân tích câu lệnh của thu ngân và đối chiếu CHÍNH XÁC với danh sách sản phẩm và khách hàng dưới đây.',
      `DANH SÁCH SẢN PHẨM JSON: ${JSON.stringify(products.map((p) => ({ id: p.id, sku: p.sku || '', name: p.name, unit: p.unit || '', price_vnd: p.sale_price_vnd })))}`,
      `DANH SÁCH KHÁCH HÀNG JSON: ${JSON.stringify(customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone || '' })))}`,
      `CÂU LỆNH BÁN HÀNG: ${JSON.stringify(transcript)}`,
      'Chỉ trả về JSON hợp lệ không markdown theo mẫu:',
      '{"items":[{"product_id":"id khớp hoặc null","matched_name":"tên sản phẩm khách gọi","quantity":1}],"customer_id":"id khách khớp hoặc null","customer_name":"tên khách hoặc Khách lẻ","is_debt":false,"note":""}',
    ].join('\n');

    const rawParsed = aiClient && typeof aiClient.parseOrder === 'function'
      ? await aiClient.parseOrder({ transcript, products, customers, prompt })
      : await callGeminiJson(env, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      });

    return {
      transcript,
      ...groundParsedOrder(rawParsed, products, customers),
    };
  });

  app.post('/api/stores/:storeId/ai/parse-invoice', {
    config: { rateLimit: { max: 15, timeWindow: '15 minutes' } },
  }, async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const mimeType = typeof request.body?.mimeType === 'string' ? request.body.mimeType.trim().toLowerCase() : '';
    const imageBase64 = typeof request.body?.imageBase64 === 'string' ? request.body.imageBase64.trim() : '';
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new ApiError(400, 'validation_error', 'Chỉ hỗ trợ ảnh hóa đơn JPEG, PNG hoặc WebP.');
    }
    if (imageBase64.length < 100 || imageBase64.length > MAX_BASE64_LENGTH || !/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64)) {
      throw new ApiError(400, 'validation_error', 'Ảnh hóa đơn không hợp lệ hoặc quá lớn (tối đa ~4MB).');
    }

    const { products, suppliers } = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!hasPermission(membership, 'edit_products') && !hasPermission(membership, 'record_cashbook')) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền quét hóa đơn nhập hàng.');
      }
      const prodRes = await client.query(
        `SELECT id, sku, name, unit, cost_vnd::text AS cost_vnd
         FROM products
         WHERE store_id = $1 AND status = 'active'
         ORDER BY updated_at DESC, name ASC
         LIMIT 400`,
        [storeId]
      );
      const supRes = await client.query(
        `SELECT id, name
         FROM suppliers
         WHERE store_id = $1 AND status = 'active'
         ORDER BY name ASC
         LIMIT 200`,
        [storeId]
      );
      return { products: prodRes.rows, suppliers: supRes.rows };
    });

    const prompt = [
      'Đọc ảnh chụp hóa đơn nhập hàng (tiếng Việt) và trích xuất tên nhà cung cấp cùng từng dòng hàng hóa.',
      `DANH SÁCH SẢN PHẨM KHO JSON: ${JSON.stringify(products.map((p) => ({ id: p.id, sku: p.sku || '', name: p.name, unit: p.unit || '' })))}`,
      `DANH SÁCH NHÀ CUNG CẤP JSON: ${JSON.stringify(suppliers.map((s) => ({ id: s.id, name: s.name })))}`,
      'Chỉ trả về JSON hợp lệ theo mẫu (import_price_vnd là ĐƠN GIÁ NHẬP số nguyên VND):',
      '{"supplier_name":"","items":[{"product_id":"id khớp hoặc null","product_name":"tên hàng trên hóa đơn","quantity":1,"import_price_vnd":0}]}',
    ].join('\n');

    const rawParsed = aiClient && typeof aiClient.parseInvoice === 'function'
      ? await aiClient.parseInvoice({ mimeType, imageBase64, products, suppliers, prompt })
      : await callGeminiJson(env, {
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: imageBase64.replace(/[\r\n]/g, '') } },
          ],
        }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
      });

    return groundParsedInvoice(rawParsed, products, suppliers);
  });
}

module.exports = {
  normalizeViText,
  callGeminiJson,
  groundParsedOrder,
  groundParsedInvoice,
  registerAiAssistantRoutes,
};
