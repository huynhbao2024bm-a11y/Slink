'use strict';

const { createHash } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');
const { insertCashMovement } = require('./cashbook-ledger');
const { normalizeOffline, beginOffline, recordOffline, expectedPrices } = require('./offline-operations');
const { calculatePromotion, consumePromotion, promotionCode } = require('./promotions');
const { normalizeSerialCodeList } = require('./serials');
const { deductBatchesFefo } = require('./batches');
const { getPosMaxDiscountPct } = require('./rbac');
const {
  parseInlineCustomerInput,
  resolveOrCreateInlineCustomer,
  getCustomerPointsState,
  settleCustomerPriorDebtFifo,
} = require('./hr-crm');

const MAX_BIGINT = 9223372036854775807n;
const SELL_ROLES = new Set(['owner', 'manager', 'cashier']);
const METHODS = new Set(['cash', 'bank_transfer', 'bank_qr', 'card', 'other']);

function amount(value, label) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  const digits = String(text);
  if (!/^(0|[1-9]\d{0,18})$/.test(digits)) throw new ApiError(400, 'validation_error', `${label} phải là số VND nguyên không âm.`);
  const parsed = BigInt(digits);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return parsed;
}

function quantityMilli(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) {
    throw new ApiError(400, 'validation_error', 'Số lượng phải lớn hơn 0 và tối đa 3 chữ số thập phân.');
  }
  const milli = Math.round(value * 1000);
  if (!Number.isSafeInteger(milli) || Math.abs(value - milli / 1000) > 1e-9) {
    throw new ApiError(400, 'validation_error', 'Số lượng chỉ được có tối đa 3 chữ số thập phân.');
  }
  return milli;
}

function quantityText(milli) {
  const whole = Math.floor(milli / 1000);
  const fraction = milli % 1000;
  return fraction ? `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}` : String(whole);
}

function requestHash(value) {
  return createHash('sha256').update(JSON.stringify(value, (_key, entry) => typeof entry === 'bigint' ? entry.toString() : entry)).digest();
}

function normalizeSale(body) {
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw new ApiError(400, 'validation_error', 'Đơn hàng cần có từ 1 đến 100 dòng sản phẩm.');
  }
  const items = [];
  const indices = new Map();
  const seenSerials = new Set();
  for (const line of body.items) {
    if (!line || typeof line.productId !== 'string' || !UUID_PATTERN.test(line.productId)) {
      throw new ApiError(400, 'validation_error', 'Có sản phẩm không hợp lệ trong đơn hàng.');
    }
    const milli = quantityMilli(line.quantity);
    const lineDiscountVnd = amount(line.discountVnd ?? 0, 'Giảm giá dòng hàng');
    const lineSerials = line.serialCodes !== undefined && line.serialCodes !== null
      ? normalizeSerialCodeList(line.serialCodes, { maxCount: 200 })
      : [];
    if (lineSerials.length && milli !== lineSerials.length * 1000) {
      throw new ApiError(400, 'validation_error', 'Số lượng bán phải khớp đúng số mã riêng đã quét (1 mã = 1 đơn vị).');
    }
    for (const sc of lineSerials) {
      const k = sc.toLocaleLowerCase('vi');
      if (seenSerials.has(k)) throw new ApiError(400, 'duplicate_serial_code', `Mã “${sc}” bị quét trùng trong cùng đơn hàng.`);
      seenSerials.add(k);
    }
    if (indices.has(line.productId)) {
      const index = indices.get(line.productId);
      if ((items[index].serialCodes.length > 0) !== (lineSerials.length > 0)) {
        throw new ApiError(400, 'validation_error', 'Không thể gộp dòng có mã riêng và dòng không có mã riêng cho cùng sản phẩm.');
      }
      items[index].quantityMilli += milli;
      if (!Number.isSafeInteger(items[index].quantityMilli)) throw new ApiError(400, 'validation_error', 'Số lượng sản phẩm vượt giới hạn.');
      items[index].lineDiscountVnd += lineDiscountVnd;
      if (items[index].lineDiscountVnd > MAX_BIGINT) throw new ApiError(400, 'validation_error', 'Giảm giá dòng hàng vượt giới hạn lưu trữ.');
      items[index].serialCodes.push(...lineSerials);
      if (!items[index].batchId && typeof line.batchId === 'string' && UUID_PATTERN.test(line.batchId)) {
        items[index].batchId = line.batchId;
      }
    } else {
      indices.set(line.productId, items.length);
      const batchId = typeof line.batchId === 'string' && UUID_PATTERN.test(line.batchId) ? line.batchId : null;
      items.push({ productId: line.productId, quantityMilli: milli, lineDiscountVnd, serialCodes: lineSerials, batchId });
    }
  }
  const discountVnd = amount(body.discountVnd ?? 0, 'Khoản giảm giá');
  const appliedPromotionCode = body.promotionCode === undefined || body.promotionCode === null || body.promotionCode === ''
    ? null
    : promotionCode(body.promotionCode);
  const rawTenders = body.tenders === undefined
    ? [{ method: body.method || 'cash', amountReceivedVnd: body.amountReceivedVnd }]
    : body.tenders;
  if (!Array.isArray(rawTenders) || rawTenders.length > 5) {
    throw new ApiError(400, 'validation_error', 'Đơn hàng cần tối đa 5 khoản thanh toán.');
  }
  const tenders = [];
  const methods = new Set();
  let amountReceivedVnd = 0n;
  for (const entry of rawTenders) {
    if (!entry || typeof entry !== 'object' || !METHODS.has(entry.method)) {
      throw new ApiError(400, 'validation_error', 'Phương thức thanh toán không hợp lệ.');
    }
    const amountReceived = amount(entry.amountReceivedVnd, 'Số tiền nhận');
    if (amountReceived === 0n) continue;
    if (methods.has(entry.method)) throw new ApiError(400, 'validation_error', 'Mỗi phương thức chỉ được nhập một khoản.');
    methods.add(entry.method);
    amountReceivedVnd += amountReceived;
    if (amountReceivedVnd > MAX_BIGINT) throw new ApiError(400, 'validation_error', 'Tổng tiền nhận vượt giới hạn lưu trữ.');
    tenders.push({ method: entry.method, amountReceivedVnd: amountReceived });
  }
  const method = tenders.length === 1 ? tenders[0].method : (tenders.length > 1 ? null : (body.method || 'cash'));
  if (method !== null && !METHODS.has(method)) throw new ApiError(400, 'validation_error', 'Phương thức thanh toán không hợp lệ.');
  const customerId = body.customerId || null;
  if (customerId !== null && (typeof customerId !== 'string' || !UUID_PATTERN.test(customerId))) {
    throw new ApiError(400, 'validation_error', 'Khách hàng không hợp lệ.');
  }
  const customerInline = typeof body.customerInline === 'string' ? body.customerInline.trim().slice(0, 160) : '';
  const sellerId = body.sellerId && typeof body.sellerId === 'string' && UUID_PATTERN.test(body.sellerId)
    ? body.sellerId.toLowerCase()
    : null;
  const redeemPoints = Boolean(body.redeemPoints);
  const pointsToRedeem = Number.isSafeInteger(body.pointsToRedeem) && body.pointsToRedeem > 0 ? body.pointsToRedeem : 0;
  const settlePriorDebt = Boolean(body.settlePriorDebt);
  const prebillEventId = body.prebillEventId && typeof body.prebillEventId === 'string' && UUID_PATTERN.test(body.prebillEventId)
    ? body.prebillEventId.toLowerCase()
    : null;
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500) throw new ApiError(400, 'validation_error', 'Ghi chú tối đa 500 ký tự.');
  const warehouseId = body.warehouseId || null;
  if (warehouseId !== null && (typeof warehouseId !== 'string' || !UUID_PATTERN.test(warehouseId))) throw new ApiError(400, 'validation_error', 'Kho bán hàng không hợp lệ.');
  return {
    items,
    discountVnd,
    appliedPromotionCode,
    amountReceivedVnd,
    method,
    tenders,
    customerId,
    customerInline,
    sellerId,
    redeemPoints,
    pointsToRedeem,
    settlePriorDebt,
    prebillEventId,
    note,
    warehouseId: warehouseId?.toLowerCase() || null,
  };
}

function distributeDiscount(lines, discount, subtotal, weightKey = 'grossVnd') {
  if (discount === 0n) return lines.map(() => 0n);
  let allocated = 0n;
  const shares = lines.map((line, index) => {
    const weight = line[weightKey];
    const numerator = discount * weight;
    const share = numerator / subtotal;
    allocated += share;
    return { index, share, remainder: numerator % subtotal };
  });
  let remainder = discount - allocated;
  shares.sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (let i = 0; remainder > 0n; i += 1, remainder -= 1n) shares[i].share += 1n;
  shares.sort((a, b) => a.index - b.index);
  return shares.map((share) => share.share);
}

function registerSalesRoutes(app, { pool, env }) {
  app.post('/api/stores/:storeId/sales', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu đơn an toàn. Hãy thử lại.');
    }
    const sale = normalizeSale(request.body);
    const offline = normalizeOffline(request.body?.offline);
    const prices = expectedPrices(request.body?.items, offline);
    const canonicalSale = {
      items: sale.items.map((line) => {
        const entry = { productId: line.productId, quantityMilli: line.quantityMilli };
        if (line.lineDiscountVnd > 0n) entry.discountVnd = line.lineDiscountVnd;
        if (line.serialCodes.length) entry.serialCodes = line.serialCodes;
        if (line.batchId) entry.batchId = line.batchId;
        return entry;
      }),
      discountVnd: sale.discountVnd,
      amountReceivedVnd: sale.amountReceivedVnd,
      method: sale.method,
      customerId: sale.customerId,
      note: sale.note,
    };
    if (sale.appliedPromotionCode) canonicalSale.promotionCode = sale.appliedPromotionCode;
    if (sale.warehouseId) canonicalSale.warehouseId = sale.warehouseId;
    if (sale.customerInline) canonicalSale.customerInline = sale.customerInline;
    if (sale.sellerId) canonicalSale.sellerId = sale.sellerId;
    if (sale.redeemPoints || sale.pointsToRedeem > 0) {
      canonicalSale.redeemPoints = true;
      canonicalSale.pointsToRedeem = sale.pointsToRedeem;
    }
    if (sale.settlePriorDebt) canonicalSale.settlePriorDebt = true;
    if (sale.prebillEventId) canonicalSale.prebillEventId = sale.prebillEventId;
    if (offline) {
      canonicalSale.offline = offline;
      canonicalSale.offlinePrices = prices;
      canonicalSale.offlineTotalVnd = String(request.body.totalVnd);
      if (!/^(0|[1-9]\d{0,18})$/.test(canonicalSale.offlineTotalVnd)) throw new ApiError(400, 'offline_total_required', 'Thiếu tổng tiền đã chốt trên thiết bị.');
    }
    // Keep the original single-tender request hash stable so a pending sale
    // can still be safely retried by a client upgraded to this version.
    if (sale.tenders.length > 1) canonicalSale.tenders = sale.tenders;
    const canonicalHash = requestHash(canonicalSale);
    const result = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!SELL_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền tạo đơn hàng.');
      const reservedKey = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, canonicalHash]
      );
      if (!reservedKey.rowCount) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const record = previous.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(canonicalHash)) {
          throw new ApiError(409, 'idempotency_conflict', 'Mã lưu đơn đã được dùng cho dữ liệu khác. Hãy tải lại trước khi gửi đơn mới.');
        }
        if (!record.response_body || !record.response_status) {
          throw new ApiError(409, 'request_in_progress', 'Đơn hàng đang được xử lý. Hãy đợi một chút rồi kiểm tra lại.');
        }
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      await beginOffline(client, offline);
      if (offline) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [storeId, idempotencyKey]);
        const priorOffline = await client.query(
          `SELECT entity_id FROM offline_operation_receipts WHERE store_id = $1 AND operation_key = $2 LIMIT 1`,
          [storeId, idempotencyKey]
        );
        if (priorOffline.rowCount) {
          throw new ApiError(409, 'offline_already_synced', 'Đơn ngoại tuyến này đã được quản lý xử lý hoặc đồng bộ trước đó.');
        }
      }
      let effectiveCustomerId = sale.customerId;
      let inlineCreatedCustomer = null;
      if (!effectiveCustomerId && sale.customerInline) {
        const resolved = await resolveOrCreateInlineCustomer(client, {
          storeId,
          userId: auth.userId,
          customerId: null,
          customerInline: sale.customerInline,
          requireExplicitNameForDebt: false,
        });
        effectiveCustomerId = resolved.customerId;
        inlineCreatedCustomer = resolved.customer || null;
      }

      let customerCreditLimit = null;
      let customerNameSnapshot = '';
      if (effectiveCustomerId) {
        const customer = await client.query(
          `SELECT id, name, credit_limit_vnd::text AS credit_limit_vnd FROM customers WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`,
          [storeId, effectiveCustomerId]
        );
        if (!customer.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng đang hoạt động.');
        customerCreditLimit = customer.rows[0].credit_limit_vnd;
        customerNameSnapshot = customer.rows[0].name || '';
      }

      const storeLoyaltyRes = await client.query(
        `SELECT COALESCE(loyalty_earn_unit_vnd, 100000)::text AS loyalty_earn_unit_vnd,
                COALESCE(loyalty_redeem_value_vnd, 1000)::text AS loyalty_redeem_value_vnd,
                COALESCE(protect_cost_margin, true) AS protect_cost_margin
         FROM stores WHERE id = $1`,
        [storeId]
      );
      const storeLoyalty = storeLoyaltyRes.rows[0] || {
        loyalty_earn_unit_vnd: '100000',
        loyalty_redeem_value_vnd: '1000',
        protect_cost_margin: true,
      };
      const loyaltyEarnUnitVnd = BigInt(storeLoyalty.loyalty_earn_unit_vnd || '100000');
      const loyaltyRedeemValueVnd = BigInt(storeLoyalty.loyalty_redeem_value_vnd || '1000');
      const storeProtectCostMargin = Boolean(storeLoyalty.protect_cost_margin);

      let effectiveSellerId = auth.userId;
      if (sale.sellerId && sale.sellerId !== auth.userId) {
        const sellerCheck = await client.query(
          `SELECT user_id FROM memberships WHERE store_id = $1 AND user_id = $2 AND status = 'active'`,
          [storeId, sale.sellerId]
        );
        if (sellerCheck.rowCount) {
          effectiveSellerId = sale.sellerId;
        }
      }

      const warehouseResult = sale.warehouseId
        ? await client.query(`SELECT id FROM warehouses WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`, [storeId, sale.warehouseId])
        : await client.query(`SELECT id FROM warehouses WHERE store_id = $1 AND is_default AND status = 'active' FOR UPDATE`, [storeId]);
      if (!warehouseResult.rowCount) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho bán hàng đang hoạt động.');
      const warehouseId = warehouseResult.rows[0].id;

      const productIds = sale.items.map((line) => line.productId).sort();
      const productResult = await client.query(
        `SELECT id, sku, name, unit, sale_price_vnd::text AS sale_price_vnd,
                cost_vnd::text AS cost_vnd, inventory_tracked, serial_tracked, batch_tracked, warranty_months, status
         FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
        [storeId, productIds]
      );
      const productMap = new Map(productResult.rows.map((product) => [product.id, product]));
      if (offline && (sale.items.some((item) => item.serialCodes?.length) || productResult.rows.some((product) => product.serial_tracked))) {
        throw new ApiError(400, 'offline_serial_requires_network', 'Hàng quản lý theo từng mã riêng cần kết nối mạng để khóa mã, không lưu đơn ngoại tuyến.');
      }
      if (offline && productResult.rows.some(product => prices[product.id] !== product.sale_price_vnd)) {
        throw new ApiError(409, 'offline_price_changed', 'Giá trên máy chủ đã đổi. Đơn trên thiết bị vẫn được giữ để kiểm tra, chưa tự đổi số tiền đã thu.');
      }
      if (productMap.size !== productIds.length || productResult.rows.some((product) => product.status !== 'active')) {
        throw new ApiError(409, 'product_unavailable', 'Có sản phẩm đã ngừng bán hoặc không còn trong cửa hàng. Hãy tải lại giỏ hàng.');
      }

      for (const productId of productIds) {
        const product = productMap.get(productId);
        if (!product.inventory_tracked) continue;
        const balance = await client.query(
          `SELECT on_hand::text AS on_hand, reserved::text AS reserved
           FROM inventory_balances WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $3
           FOR UPDATE`,
          [storeId, productId, warehouseId]
        );
        if (!balance.rowCount) throw new ApiError(409, 'inventory_unavailable', 'Chưa có số dư tồn kho cho một sản phẩm. Hãy cập nhật danh mục.');
        const line = sale.items.find((item) => item.productId === productId);
        const requested = BigInt(line.quantityMilli);
        const onHandMilli = BigInt(Math.round(Number(balance.rows[0].on_hand) * 1000));
        const reservedMilli = BigInt(Math.round(Number(balance.rows[0].reserved) * 1000));
        if (requested > onHandMilli - reservedMilli) {
          throw new ApiError(409, 'insufficient_stock', `${product.name} không đủ tồn kho để hoàn tất đơn.`);
        }
      }

      const reservedSerialMap = new Map();
      for (const productId of productIds) {
        const product = productMap.get(productId);
        const line = sale.items.find((item) => item.productId === productId);
        if (line.serialCodes?.length) {
          const lowerList = line.serialCodes.map((c) => c.toLocaleLowerCase('vi'));
          const serialRes = await client.query(
            `SELECT id, code, product_id, warehouse_id, status
             FROM product_serial_codes
             WHERE store_id = $1 AND lower(code) = ANY($2::text[])
             ORDER BY id FOR UPDATE`,
            [storeId, lowerList]
          );
          const byLower = new Map(serialRes.rows.map((r) => [r.code.toLocaleLowerCase('vi'), r]));
          const lockedIds = [];
          const canonicalCodes = [];
          for (const reqCode of line.serialCodes) {
            const row = byLower.get(reqCode.toLocaleLowerCase('vi'));
            if (!row || row.product_id !== productId || row.warehouse_id !== warehouseId) {
              throw new ApiError(409, 'serial_unavailable', `Mã “${reqCode}” không có trong kho bán hiện tại cho sản phẩm ${product.name}.`);
            }
            if (row.status !== 'in_stock') {
              throw new ApiError(409, 'serial_already_sold', `Mã “${row.code}” đã được bán hoặc ngừng dùng — không thể bán lại.`);
            }
            lockedIds.push(row.id);
            canonicalCodes.push(row.code);
          }
          reservedSerialMap.set(productId, { ids: lockedIds, codes: canonicalCodes });
        } else if (product.serial_tracked && product.inventory_tracked) {
          if (line.quantityMilli % 1000 !== 0) {
            throw new ApiError(400, 'validation_error', `${product.name} quản lý theo từng mã riêng, chỉ bán số lượng nguyên.`);
          }
          const wholeQty = line.quantityMilli / 1000;
          const fifoRes = await client.query(
            `SELECT id, code FROM product_serial_codes
             WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $3 AND status = 'in_stock'
             ORDER BY created_at ASC, id ASC
             LIMIT $4 FOR UPDATE`,
            [storeId, productId, warehouseId, wholeQty]
          );
          if (fifoRes.rowCount < wholeQty) {
            throw new ApiError(409, 'insufficient_stock', `${product.name} không đủ mã khả dụng trong kho để bán.`);
          }
          reservedSerialMap.set(productId, {
            ids: fifoRes.rows.map((r) => r.id),
            codes: fifoRes.rows.map((r) => r.code),
          });
        }
      }

      const lines = sale.items.map((line) => {
        const product = productMap.get(line.productId);
        const price = BigInt(product.sale_price_vnd);
        const cost = BigInt(product.cost_vnd);
        const grossVnd = (price * BigInt(line.quantityMilli) + 500n) / 1000n;
        if (line.lineDiscountVnd > grossVnd) {
          throw new ApiError(400, 'validation_error', `Khoản giảm giá của "${product.name}" không được vượt quá thành tiền dòng.`);
        }
        const netAfterLineVnd = grossVnd - line.lineDiscountVnd;
        const lineCostVnd = (cost * BigInt(line.quantityMilli) + 500n) / 1000n;
        return { ...line, product, price, cost, grossVnd, netAfterLineVnd, lineCostVnd };
      });
      const subtotal = lines.reduce((sum, line) => sum + line.grossVnd, 0n);
      const lineDiscountTotalVnd = lines.reduce((sum, line) => sum + line.lineDiscountVnd, 0n);
      const manualDiscountTotalVnd = lineDiscountTotalVnd + sale.discountVnd;
      const totalCostVnd = lines.reduce((sum, line) => sum + line.lineCostVnd, 0n);
      const appliedPromotion = sale.appliedPromotionCode
        ? await calculatePromotion(client, {
          storeId, code: sale.appliedPromotionCode, customerId: effectiveCustomerId, subtotalVnd: subtotal, lock: true,
        })
        : null;
      const promotionDiscountVnd = appliedPromotion?.discountVnd || 0n;
      // Cap combined manual POS discount (per-line + order-level; promotionCode is governed by promotions.js).
      const maxDiscountPct = getPosMaxDiscountPct(membership);
      if (manualDiscountTotalVnd > 0n) {
        if (maxDiscountPct === 0 || manualDiscountTotalVnd * 100n > subtotal * BigInt(maxDiscountPct)) {
          throw new ApiError(
            403,
            'discount_limit_exceeded',
            maxDiscountPct === 0
              ? 'Tài khoản này không được phép giảm giá thủ công trên POS.'
              : `Mức giảm giá vượt giới hạn tối đa ${maxDiscountPct}% được cấp.`
          );
        }
      }

      let pointsRedeemed = 0;
      let pointsRedeemedVnd = 0n;
      if (effectiveCustomerId && (sale.redeemPoints || sale.pointsToRedeem > 0)) {
        const pointsState = await getCustomerPointsState(client, storeId, effectiveCustomerId);
        const availablePoints = pointsState ? pointsState.redeemablePoints : 0;
        const requestedPoints = sale.pointsToRedeem > 0
          ? Math.min(sale.pointsToRedeem, availablePoints)
          : availablePoints;
        const remainingAfterBaseDiscount = subtotal > (manualDiscountTotalVnd + promotionDiscountVnd)
          ? subtotal - (manualDiscountTotalVnd + promotionDiscountVnd)
          : 0n;
        const maxPointsForOrder = loyaltyRedeemValueVnd > 0n
          ? Number(remainingAfterBaseDiscount / loyaltyRedeemValueVnd)
          : 0;
        pointsRedeemed = Math.max(0, Math.min(requestedPoints, maxPointsForOrder));
        pointsRedeemedVnd = BigInt(pointsRedeemed) * loyaltyRedeemValueVnd;
      }

      const totalDiscountVnd = manualDiscountTotalVnd + promotionDiscountVnd + pointsRedeemedVnd;
      if (subtotal > MAX_BIGINT || totalDiscountVnd > subtotal) {
        throw new ApiError(400, 'validation_error', 'Khoản giảm giá không được vượt quá tiền hàng.');
      }
      const total = subtotal - totalDiscountVnd;
      if (offline && total.toString() !== canonicalSale.offlineTotalVnd) throw new ApiError(409, 'offline_total_changed', 'Tổng tiền trên thiết bị không khớp. Chưa ghi đơn; cần kiểm tra chứng từ chờ.');
      if (sale.tenders.length === 0 && total > 0n && !effectiveCustomerId) {
        throw new ApiError(400, 'customer_required', 'Cần chọn khách hàng để ghi nhận phần còn nợ.');
      }
      if (
        storeProtectCostMargin
        && membership.role !== 'owner'
        && totalCostVnd > 0n
        && (manualDiscountTotalVnd > 0n || pointsRedeemedVnd > 0n)
        && (subtotal - manualDiscountTotalVnd - pointsRedeemedVnd < totalCostVnd)
      ) {
        throw new ApiError(
          403,
          'margin_guard_violation',
          'Chốt chặn bảo vệ giá vốn: Mức giảm giá làm giá bán thấp hơn giá vốn hàng hóa. Chỉ Chủ cửa hàng mới được phép bán dưới giá vốn.'
        );
      }

      let priorCustomerBalanceVnd = 0n;
      if (effectiveCustomerId) {
        const creditBalance = await client.query(
          `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS balance_vnd
           FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2`,
          [storeId, effectiveCustomerId]
        );
        priorCustomerBalanceVnd = BigInt(creditBalance.rows[0].balance_vnd || '0');
      }

      const maxAllowedNonCashVnd = (sale.settlePriorDebt && effectiveCustomerId && priorCustomerBalanceVnd > 0n)
        ? (total + priorCustomerBalanceVnd)
        : total;
      const nonCashReceived = sale.tenders.filter((tender) => tender.method !== 'cash')
        .reduce((sum, tender) => sum + tender.amountReceivedVnd, 0n);
      const cashTender = sale.tenders.find((tender) => tender.method === 'cash');
      const cashReceived = cashTender ? cashTender.amountReceivedVnd : 0n;
      if (nonCashReceived > maxAllowedNonCashVnd || (sale.amountReceivedVnd > maxAllowedNonCashVnd && cashReceived === 0n)) {
        throw new ApiError(400, 'validation_error', 'Chỉ tiền mặt mới được nhận dư để thối; tổng thanh toán không tiền mặt không được vượt tổng đơn.');
      }

      // Priority Step 1: Apply payment to the NEW order first
      const nonCashForNewOrder = nonCashReceived < total ? nonCashReceived : total;
      const cashNeededForNewOrder = total - nonCashForNewOrder;
      const cashApplied = cashReceived < cashNeededForNewOrder ? cashReceived : cashNeededForNewOrder;
      const paid = nonCashForNewOrder + cashApplied;

      if (paid < total && !effectiveCustomerId) {
        throw new ApiError(400, 'customer_required', 'Cần chọn khách hàng để ghi nhận phần còn nợ.');
      }
      if (paid < total && sale.customerInline && !sale.customerId) {
        const parsedInline = parseInlineCustomerInput(sale.customerInline);
        if (!parsedInline || !parsedInline.explicitName) {
          throw new ApiError(
            400,
            'customer_name_required_for_debt',
            'Đơn mua nợ cần gõ kèm tên gợi nhớ cạnh SĐT (VD: 0912345678 Chị Lan).'
          );
        }
      }

      let creditUsed = 0n;
      if (effectiveCustomerId && paid < total) {
        if (customerCreditLimit !== null && priorCustomerBalanceVnd + total - paid > BigInt(customerCreditLimit)) {
          throw new ApiError(409, 'customer_credit_limit', 'Khoản nợ mới vượt hạn mức của khách. Thu bớt tiền hoặc đổi hạn mức trong hồ sơ khách.');
        }
        const available = -priorCustomerBalanceVnd;
        if (available > 0n) creditUsed = available < total - paid ? available : total - paid;
      }

      // Priority Step 2: If settlePriorDebt is enabled, allocate surplus payment above new order total to prior debt FIFO
      const surplusAfterNewOrder = sale.amountReceivedVnd - paid;
      const priorDebtToSettleVnd = (sale.settlePriorDebt && effectiveCustomerId && priorCustomerBalanceVnd > 0n && surplusAfterNewOrder > 0n)
        ? (surplusAfterNewOrder < priorCustomerBalanceVnd ? surplusAfterNewOrder : priorCustomerBalanceVnd)
        : 0n;

      // Priority Step 3: Remaining cash after new order + prior debt becomes cash change
      const change = sale.amountReceivedVnd - paid - priorDebtToSettleVnd;
      const cashSessionId = cashReceived > 0n || change > 0n ? await lockActiveCashSession(client, storeId) : null;

      let remainingNonCashForNewOrder = nonCashForNewOrder;
      const appliedTenders = sale.tenders.map((tender) => {
        if (tender.method === 'cash') {
          return {
            method: 'cash',
            amountVnd: cashApplied,
            cashMovementInVnd: cashApplied + change,
          };
        }
        const usedForOrder = tender.amountReceivedVnd < remainingNonCashForNewOrder
          ? tender.amountReceivedVnd
          : remainingNonCashForNewOrder;
        remainingNonCashForNewOrder -= usedForOrder;
        return {
          method: tender.method,
          amountVnd: usedForOrder,
          cashMovementInVnd: usedForOrder,
        };
      }).filter((tender) => tender.amountVnd > 0n || tender.cashMovementInVnd > 0n);

      const orderLevelDiscountVnd = sale.discountVnd + promotionDiscountVnd + pointsRedeemedVnd;
      const allocatedOrderDiscount = distributeDiscount(lines, orderLevelDiscountVnd, (subtotal - lineDiscountTotalVnd) || 1n, 'netAfterLineVnd');
      const allocatedDiscount = lines.map((line, index) => line.lineDiscountVnd + allocatedOrderDiscount[index]);

      if (appliedPromotion) await consumePromotion(client, { storeId, promotionId: appliedPromotion.id });

      const pointsEarned = (effectiveCustomerId && loyaltyEarnUnitVnd > 0n)
        ? Number((paid + creditUsed) / loyaltyEarnUnitVnd)
        : 0;

      const sequenceResult = await client.query(
        `UPDATE store_sequences SET next_order_number = next_order_number + 1
         WHERE store_id = $1 RETURNING next_order_number - 1 AS order_number`,
        [storeId]
      );
      if (!sequenceResult.rowCount) throw new Error('Store order sequence is missing.');
      const orderNumber = `SL-${sequenceResult.rows[0].order_number}`;
      const orderResult = await client.query(
        `INSERT INTO orders (store_id, order_number, customer_id, cashier_id, seller_id, warehouse_id, status, subtotal_vnd,
                             discount_vnd, tax_vnd, total_vnd, cash_received_vnd, cash_change_vnd,
                             points_redeemed, points_redeemed_vnd, points_earned, prebill_event_id, note)
         VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7, $8, 0, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING id, order_number, status, subtotal_vnd::text AS subtotal_vnd,
                   discount_vnd::text AS discount_vnd, total_vnd::text AS total_vnd,
                   cash_received_vnd::text AS cash_received_vnd, cash_change_vnd::text AS cash_change_vnd,
                   points_redeemed, points_redeemed_vnd::text AS points_redeemed_vnd, points_earned, occurred_at`,
        [
          storeId, orderNumber, effectiveCustomerId, auth.userId, effectiveSellerId, warehouseId,
          subtotal.toString(), totalDiscountVnd.toString(), total.toString(),
          cashReceived.toString(), change.toString(),
          pointsRedeemed, pointsRedeemedVnd.toString(), pointsEarned, sale.prebillEventId, sale.note,
        ]
      );
      const order = orderResult.rows[0];
      if (appliedPromotion) {
        await client.query(
          `INSERT INTO promotion_redemptions (store_id, promotion_id, order_id, customer_id, cashier_id, code_snapshot, discount_vnd)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [storeId, appliedPromotion.id, order.id, effectiveCustomerId, auth.userId, appliedPromotion.code, promotionDiscountVnd.toString()]
        );
      }
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const lineTotal = line.grossVnd - allocatedDiscount[index];
        await client.query(
          `INSERT INTO order_lines (store_id, order_id, product_id, product_name_snapshot, sku_snapshot,
                                    unit_snapshot, quantity, unit_price_vnd, unit_cost_vnd, discount_vnd, line_total_vnd)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [storeId, order.id, line.product.id, line.product.name, line.product.sku, line.product.unit,
            quantityText(line.quantityMilli), line.price.toString(), line.cost.toString(), allocatedDiscount[index].toString(), lineTotal.toString()]
        );
        if (line.product.inventory_tracked) {
          await client.query(
            `UPDATE inventory_balances SET on_hand = on_hand - $3::numeric, version = version + 1, updated_at = now()
             WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $4`,
            [storeId, line.product.id, quantityText(line.quantityMilli), warehouseId]
          );
          const after = await client.query(
            `SELECT on_hand::text AS on_hand FROM inventory_balances WHERE store_id = $1 AND product_id = $2
             AND warehouse_id = $3`,
            [storeId, line.product.id, warehouseId]
          );
          await client.query(
            `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                               reason, source_type, source_id, actor_user_id)
             VALUES ($1, $2, $3, 'sale', -$4::numeric, $5::numeric, $6, 'order', $7, $8)`,
            [storeId, warehouseId, line.product.id, quantityText(line.quantityMilli), after.rows[0].on_hand,
              `Bán hàng ${orderNumber}`, order.id, auth.userId]
          );
          if (line.product.batch_tracked) {
            await deductBatchesFefo(client, {
              storeId,
              productId: line.product.id,
              warehouseId,
              quantityMilli: line.quantityMilli,
              preferredBatchId: line.batchId || null,
            });
          }
          const serialLock = reservedSerialMap.get(line.product.id);
          if (serialLock && serialLock.ids.length) {
            const warrantyMonths = Number(line.product.warranty_months || 0);
            const stamped = await client.query(
              `UPDATE product_serial_codes
               SET status = 'sold',
                   order_id = $3,
                   sold_at = now(),
                   warranty_expires_at = CASE
                     WHEN $4::integer > 0 THEN now() + make_interval(months => $4::integer)
                     ELSE NULL
                   END,
                   updated_at = now()
               WHERE store_id = $1 AND id = ANY($2::uuid[])
               RETURNING id, code, warranty_expires_at`,
              [storeId, serialLock.ids, order.id, warrantyMonths]
            );
            const expiresById = new Map(stamped.rows.map((r) => [r.id, r.warranty_expires_at || null]));
            serialLock.warranties = serialLock.ids.map((id, idx) => ({
              code: serialLock.codes[idx],
              warrantyExpiresAt: expiresById.get(id) || null,
            }));
          }
        }
      }

      for (const tender of appliedTenders) {
        if (tender.amountVnd <= 0n) continue;
        await client.query(
          `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, recorded_by)
           VALUES ($1, $2, $3, 'succeeded', $4, $5)`,
          [storeId, order.id, tender.method, tender.amountVnd.toString(), auth.userId]
        );
      }
      if (creditUsed > 0n) {
        await client.query(
          `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, provider, recorded_by)
           VALUES ($1, $2, 'other', 'succeeded', $3, 'customer_credit', $4)`,
          [storeId, order.id, creditUsed.toString(), auth.userId]
        );
      }
      for (const tender of appliedTenders) {
        if (tender.cashMovementInVnd <= 0n) continue;
        await insertCashMovement(client, {
          storeId,
          direction: 'in',
          category: 'Bán hàng',
          amountVnd: tender.cashMovementInVnd.toString(),
          method: tender.method,
          sourceType: 'order_payment',
          sourceId: order.id,
          note: `Thu đơn ${orderNumber}`,
          actorUserId: auth.userId,
          cashSessionId: tender.method === 'cash' ? cashSessionId : null,
          counterpartyKind: effectiveCustomerId ? 'customer' : null,
          counterpartyId: effectiveCustomerId || null,
          counterpartyName: effectiveCustomerId ? customerNameSnapshot : 'Khách lẻ',
        });
      }
      if (change > 0n) {
        await insertCashMovement(client, {
          storeId,
          direction: 'out',
          category: 'Tiền thối',
          amountVnd: change.toString(),
          method: 'cash',
          sourceType: 'order_change',
          sourceId: order.id,
          note: `Thối tiền đơn ${orderNumber}`,
          actorUserId: auth.userId,
          cashSessionId,
          counterpartyKind: effectiveCustomerId ? 'customer' : null,
          counterpartyId: effectiveCustomerId || null,
          counterpartyName: effectiveCustomerId ? customerNameSnapshot : 'Khách lẻ',
        });
      }
      if (effectiveCustomerId) {
        if (total > 0n) {
          await client.query(
            `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, 'sale_debit', $3, 'order', $4, $5, $6)`,
            [storeId, effectiveCustomerId, total.toString(), order.id, `Đơn ${orderNumber}`, auth.userId]
          );
        }
        if (paid > 0n) {
          await client.query(
            `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6)`,
            [storeId, effectiveCustomerId, paid.toString(), order.id, `Thu tiền đơn ${orderNumber}`, auth.userId]
          );
        }
        if (pointsRedeemed > 0) {
          await client.query(
            `INSERT INTO customer_point_ledger_entries (store_id, customer_id, entry_type, points_delta, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, 'redeem_sale', $3, 'order', $4, $5, $6)`,
            [storeId, effectiveCustomerId, -pointsRedeemed, order.id, `Dùng ${pointsRedeemed} điểm trừ tiền đơn ${orderNumber}`, auth.userId]
          );
        }
        if (pointsEarned > 0) {
          await client.query(
            `INSERT INTO customer_point_ledger_entries (store_id, customer_id, entry_type, points_delta, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, 'earn_sale', $3, 'order', $4, $5, $6)`,
            [storeId, effectiveCustomerId, pointsEarned, order.id, `Tích điểm đơn ${orderNumber}`, auth.userId]
          );
        }
      }

      let priorDebtSettlement = { settledVnd: 0n, allocations: [], openingAllocations: [] };
      if (priorDebtToSettleVnd > 0n && effectiveCustomerId) {
        let debtRemainingToAllocate = priorDebtToSettleVnd;
        let remNonCashForOrder = nonCashForNewOrder;
        const debtSlices = [];
        for (const t of sale.tenders) {
          if (t.method === 'cash' || debtRemainingToAllocate <= 0n) continue;
          const usedForOrd = t.amountReceivedVnd < remNonCashForOrder ? t.amountReceivedVnd : remNonCashForOrder;
          remNonCashForOrder -= usedForOrd;
          const surplus = t.amountReceivedVnd - usedForOrd;
          if (surplus > 0n) {
            const take = surplus < debtRemainingToAllocate ? surplus : debtRemainingToAllocate;
            debtSlices.push({ method: t.method, amountVnd: take });
            debtRemainingToAllocate -= take;
          }
        }
        if (debtRemainingToAllocate > 0n) {
          debtSlices.push({ method: 'cash', amountVnd: debtRemainingToAllocate });
        }
        const mergedAllocations = [];
        const mergedOpening = [];
        let totalSettledVnd = 0n;
        for (const slice of debtSlices) {
          if (slice.amountVnd <= 0n) continue;
          const part = await settleCustomerPriorDebtFifo(client, {
            storeId,
            customerId: effectiveCustomerId,
            customerName: customerNameSnapshot,
            amountVnd: slice.amountVnd,
            method: slice.method,
            actorUserId: auth.userId,
            cashSessionId,
            orderNumber,
            excludeOrderId: order.id,
          });
          totalSettledVnd += part.settledVnd || 0n;
          mergedAllocations.push(...(part.allocations || []));
          mergedOpening.push(...(part.openingAllocations || []));
        }
        priorDebtSettlement = { settledVnd: totalSettledVnd, allocations: mergedAllocations, openingAllocations: mergedOpening };
      }

      if (sale.prebillEventId) {
        await client.query(
          `UPDATE pos_prebill_events
           SET matched_order_id = $3,
               status = CASE WHEN $4::bigint * 100 < expected_total_vnd * 85 THEN 'abandoned_or_shrunk' ELSE 'completed' END
           WHERE store_id = $1 AND id = $2`,
          [storeId, sale.prebillEventId, order.id, total.toString()]
        );
      }

      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'sale.created', 'order', $3, $4::jsonb)`,
        [storeId, auth.userId, order.id, JSON.stringify({
          orderNumber,
          sellerId: effectiveSellerId,
          customerId: effectiveCustomerId,
          totalVnd: total.toString(),
          receivedVnd: sale.amountReceivedVnd.toString(),
          cashReceivedVnd: cashReceived.toString(),
          cashChangeVnd: change.toString(),
          pointsRedeemed,
          pointsRedeemedVnd: pointsRedeemedVnd.toString(),
          pointsEarned,
          priorDebtSettledVnd: priorDebtSettlement.settledVnd.toString(),
          promotion: appliedPromotion ? { code: appliedPromotion.code, discountVnd: promotionDiscountVnd.toString() } : null,
          payments: appliedTenders.filter((t) => t.amountVnd > 0n).map((tender) => ({ method: tender.method, amountVnd: tender.amountVnd.toString() })),
          customerCreditUsedVnd: creditUsed.toString(),
        })]
      );
      const postSaleLoyalty = effectiveCustomerId
        ? await getCustomerPointsState(client, storeId, effectiveCustomerId)
        : null;
      const body = {
        order: {
          id: order.id,
          number: order.order_number,
          status: order.status,
          customerId: effectiveCustomerId,
          customerName: postSaleLoyalty?.name || null,
          customerPhone: postSaleLoyalty?.phone || null,
          inlineCreatedCustomer,
          sellerId: effectiveSellerId,
          subtotalVnd: order.subtotal_vnd,
          discountVnd: order.discount_vnd,
          pointsRedeemed,
          pointsRedeemedVnd: pointsRedeemedVnd.toString(),
          pointsEarned,
          customerPointsBalance: postSaleLoyalty ? postSaleLoyalty.pointsBalance : null,
          loyaltySummary: effectiveCustomerId ? {
            customerId: effectiveCustomerId,
            customerName: postSaleLoyalty?.name || '',
            customerPhone: postSaleLoyalty?.phone || '',
            pointsEarned,
            pointsRedeemed,
            pointsRedeemedVnd: pointsRedeemedVnd.toString(),
            pointsBalance: postSaleLoyalty ? postSaleLoyalty.pointsBalance : pointsEarned,
          } : null,
          priorDebtSettledVnd: priorDebtSettlement.settledVnd.toString(),
          priorDebtAllocations: priorDebtSettlement.allocations,
          promotion: appliedPromotion ? { code: appliedPromotion.code, name: appliedPromotion.name, discountVnd: promotionDiscountVnd.toString() } : null,
          totalVnd: order.total_vnd,
          paidVnd: (paid + creditUsed).toString(),
          dueVnd: (total - paid - creditUsed).toString(),
          cashReceivedVnd: order.cash_received_vnd,
          changeVnd: change.toString(),
          payments: appliedTenders.filter((t) => t.amountVnd > 0n).map((tender) => ({ method: tender.method, amountVnd: tender.amountVnd.toString() })).concat(creditUsed > 0n ? [{ method: 'customer_credit', amountVnd: creditUsed.toString() }] : []),
          occurredAt: order.occurred_at,
          items: lines.map((line, index) => {
            const serialLock = reservedSerialMap.get(line.product.id);
            return {
              productId: line.product.id,
              name: line.product.name,
              sku: line.product.sku,
              quantity: quantityText(line.quantityMilli),
              unitPriceVnd: line.price.toString(),
              discountVnd: allocatedDiscount[index].toString(),
              lineTotalVnd: (line.grossVnd - allocatedDiscount[index]).toString(),
              warrantyMonths: Number(line.product.warranty_months || 0),
              ...(serialLock?.codes?.length ? { serialCodes: serialLock.codes } : {}),
              ...(serialLock?.warranties?.length ? { serialWarranties: serialLock.warranties } : {}),
            };
          }),
        },
      };
      await recordOffline(client, { storeId, userId: auth.userId, key: idempotencyKey, kind: 'sale', entityId: order.id, metadata: offline });
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
      );
      return { status: 201, body, replayed: false };
    });
    if (result.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(result.status).send(result.body);
  });
}

module.exports = { registerSalesRoutes, normalizeSale, quantityMilli, quantityText, distributeDiscount };
