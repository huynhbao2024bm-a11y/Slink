'use strict';

const { createHash } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');
const { insertCashMovement } = require('./cashbook-ledger');
const { normalizeOffline, expectedPrices } = require('./offline-operations');
const { normalizeSale, quantityText, distributeDiscount } = require('./sales');
const { findAccessibleWarehouse, requireWarehouseAccess } = require('./warehouse-access');

const MAX_BIGINT = 9223372036854775807n;
const RESOLVE_ROLES = new Set(['owner', 'manager']);
const CASH_VIEW_ROLES = new Set(['owner', 'manager', 'cashier', 'accountant']);
const ALL_STORE_ROLES = new Set(['owner', 'manager', 'cashier', 'stockkeeper', 'accountant']);
const RESOLUTION_MODES = new Set(['accept_historical_price', 'accept_current_price_with_discount']);
const VALID_KINDS = new Set(['sale', 'purchase', 'stock-count', 'cash', 'shift-open', 'shift-close']);

function parseDbMilli(value) {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(value == null ? '0' : value).trim());
  if (!match) return 0;
  const sign = match[1] ? -1 : 1;
  return sign * (Number(match[2]) * 1000 + Number((match[3] || '').slice(0, 3).padEnd(3, '0')));
}

function parseAmount(value, label) {
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' && typeof text !== 'number') {
    throw new ApiError(400, 'validation_error', `${label} không hợp lệ.`);
  }
  const digits = String(text);
  if (!/^(0|[1-9]\d{0,18})$/.test(digits)) {
    throw new ApiError(400, 'validation_error', `${label} phải là số VND nguyên không âm.`);
  }
  const parsed = BigInt(digits);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return parsed;
}

function safeVndString(value, fallback) {
  const raw = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : String(value ?? '');
  if (/^(0|[1-9]\d{0,18})$/.test(raw) && BigInt(raw) <= MAX_BIGINT) return raw;
  return String(fallback);
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value, (_k, entry) => (typeof entry === 'bigint' ? entry.toString() : entry)))
    .digest();
}

async function resolveWarehouseId(client, storeId, warehouseId, { lock = true } = {}) {
  if (warehouseId !== null && warehouseId !== undefined && (typeof warehouseId !== 'string' || !UUID_PATTERN.test(warehouseId))) {
    throw new ApiError(400, 'validation_error', 'Mã kho không hợp lệ.');
  }
  const lockSql = lock ? ' FOR UPDATE' : '';
  const res = warehouseId
    ? await client.query(
      `SELECT id FROM warehouses WHERE store_id = $1 AND id = $2 AND status = 'active'${lockSql}`,
      [storeId, warehouseId]
    )
    : await client.query(
      `SELECT id FROM warehouses WHERE store_id = $1 AND is_default AND status = 'active'${lockSql}`,
      [storeId]
    );
  return res.rows[0]?.id || null;
}

async function loadProductsAndBalances(client, storeId, warehouseId, items, { lock = false } = {}) {
  const productIds = [...new Set(items.map((item) => item.productId))].sort();
  const lockSql = lock ? ' FOR UPDATE' : '';
  const productResult = productIds.length
    ? await client.query(
      `SELECT id, sku, name, unit, sale_price_vnd::text AS sale_price_vnd,
              cost_vnd::text AS cost_vnd, inventory_tracked, serial_tracked, status
       FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id${lockSql}`,
      [storeId, productIds]
    )
    : { rows: [] };
  const productMap = new Map(productResult.rows.map((p) => [p.id, p]));

  const balanceMap = new Map();
  if (warehouseId && productIds.length) {
    const balances = await client.query(
      `SELECT product_id, on_hand::text AS on_hand, reserved::text AS reserved
       FROM inventory_balances
       WHERE store_id = $1 AND warehouse_id = $2 AND product_id = ANY($3::uuid[])
       ORDER BY product_id${lockSql}`,
      [storeId, warehouseId, productIds]
    );
    for (const row of balances.rows) balanceMap.set(row.product_id, row);
  }
  return { productIds, productMap, balanceMap };
}

function evaluateSaleLines(items, prices, productMap, balanceMap) {
  let offlineSubtotal = 0n;
  let serverSubtotal = 0n;
  let hasPriceChange = false;
  let hasStockShortfall = false;
  let hasUnavailableProduct = false;
  const requestedByProduct = new Map();
  const evaluated = [];

  for (const item of items) {
    requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) || 0) + item.quantityMilli);
  }

  for (const item of items) {
    const product = productMap.get(item.productId);
    const offlinePrice = prices[item.productId] !== undefined ? BigInt(prices[item.productId]) : BigInt(product?.sale_price_vnd || 0);
    const serverPrice = BigInt(product?.sale_price_vnd || 0);
    const qtyBig = BigInt(item.quantityMilli);
    const offlineLineTotal = (offlinePrice * qtyBig + 500n) / 1000n;
    const serverLineTotal = (serverPrice * qtyBig + 500n) / 1000n;
    offlineSubtotal += offlineLineTotal;
    serverSubtotal += serverLineTotal;

    const bal = balanceMap.get(item.productId);
    const availableMilli = bal ? Math.max(0, parseDbMilli(bal.on_hand) - parseDbMilli(bal.reserved)) : 0;
    const totalRequested = requestedByProduct.get(item.productId) || item.quantityMilli;
    const shortfallMilli = product?.inventory_tracked ? Math.max(0, totalRequested - availableMilli) : 0;

    if (!product || product.status !== 'active') hasUnavailableProduct = true;
    if (product && offlinePrice !== serverPrice) hasPriceChange = true;
    if (shortfallMilli > 0) hasStockShortfall = true;

    evaluated.push({
      productId: item.productId,
      sku: product?.sku || '',
      name: product?.name || 'Sản phẩm không còn trong danh mục',
      unit: product?.unit || '',
      quantity: quantityText(item.quantityMilli),
      offlineUnitPriceVnd: offlinePrice.toString(),
      serverUnitPriceVnd: serverPrice.toString(),
      linePriceDeltaVnd: (serverLineTotal - offlineLineTotal).toString(),
      inventoryTracked: Boolean(product?.inventory_tracked),
      availableToSell: product?.inventory_tracked ? quantityText(availableMilli) : null,
      stockShortfall: shortfallMilli > 0 ? quantityText(shortfallMilli) : null,
      productStatus: product?.status || 'missing',
    });
  }

  return { items: evaluated, offlineSubtotal, serverSubtotal, hasPriceChange, hasStockShortfall, hasUnavailableProduct };
}

function buildSaleExplanation({ flags, offlineTotalVnd, serverTotalVnd, collectedVnd, activeSession, issue }) {
  const parts = [];
  if (flags.hasPriceChange) {
    parts.push(`Giá mặt hàng đã thay đổi (lúc bán tổng ${offlineTotalVnd}đ, theo giá mới là ${serverTotalVnd}đ; khách đã thanh toán ${collectedVnd}đ).`);
  }
  if (flags.hasStockShortfall) {
    parts.push('Tồn kho hiện không đủ cho số lượng trong đơn tạm; cần nhập thêm hàng trước khi đồng bộ.');
  }
  if (flags.shiftChanged) {
    parts.push(`Ca tiền mặt lúc bán đã đóng; hiện có ca đang mở của ${activeSession?.opened_by_name || 'nhân viên'}.`);
  } else if (flags.shiftMissing) {
    parts.push('Hiện chưa có ca tiền mặt nào đang mở để ghi nhận khoản tiền mặt của đơn này.');
  }
  if (!parts.length && issue?.message) parts.push(issue.message);
  return parts.join(' ');
}

async function inspectSaleConflict(client, storeId, membership, payload, issue) {
  const sale = normalizeSale(payload);
  const offline = normalizeOffline(payload?.offline);
  const prices = expectedPrices(payload?.items, offline) || {};
  const warehouse = await findAccessibleWarehouse(client, storeId, membership, sale.warehouseId, { lock: false });
  if (sale.warehouseId) requireWarehouseAccess(membership, sale.warehouseId);
  const warehouseId = warehouse?.id || null;

  const { productMap, balanceMap } = await loadProductsAndBalances(client, storeId, warehouseId, sale.items);
  const lineSummary = evaluateSaleLines(sale.items, prices, productMap, balanceMap);

  const canViewCash = CASH_VIEW_ROLES.has(membership.role);
  const sessionRes = canViewCash
    ? await client.query(
      `SELECT s.id, s.opened_at, COALESCE(u.display_name, '') AS opened_by_name
       FROM cash_register_sessions s
       LEFT JOIN users u ON u.id = s.opened_by
       WHERE s.store_id = $1 AND s.status = 'open'
       LIMIT 1`,
      [storeId]
    )
    : { rows: [] };
  const activeSession = sessionRes.rows[0] || null;
  const usesCash = sale.tenders.some((t) => t.method === 'cash');
  const shiftChanged = Boolean(usesCash && offline?.cashSessionId && activeSession && offline.cashSessionId !== activeSession.id);
  const shiftMissing = Boolean(canViewCash && usesCash && !activeSession);
  const clockBeforeShift = Boolean(usesCash && offline?.occurredAt && activeSession && new Date(offline.occurredAt) < new Date(activeSession.opened_at));

  const isManager = RESOLVE_ROLES.has(membership.role);
  const offlineTotalVnd = lineSummary.offlineSubtotal >= sale.discountVnd ? lineSummary.offlineSubtotal - sale.discountVnd : 0n;
  const serverTotalVnd = lineSummary.serverSubtotal >= sale.discountVnd ? lineSummary.serverSubtotal - sale.discountVnd : 0n;
  const blockedReasons = [];
  if (!warehouseId) blockedReasons.push('Kho bán hàng không còn hoạt động.');
  if (sale.appliedPromotionCode) blockedReasons.push('Đơn ngoại tuyến có mã khuyến mãi cần kiểm tra lại trực tuyến.');
  if (lineSummary.hasUnavailableProduct) blockedReasons.push('Có sản phẩm trong đơn đã ngừng bán hoặc bị xóa.');
  if (lineSummary.hasStockShortfall) blockedReasons.push('Tồn kho hiện tại chưa đủ. Hãy nhập bổ sung hàng vào kho trước khi chốt đơn.');
  if (shiftMissing) blockedReasons.push('Chưa có ca tiền mặt đang mở trên máy chủ. Hãy mở ca trước khi chốt đơn thu tiền mặt.');
  if (!isManager && (lineSummary.hasPriceChange || shiftChanged || clockBeforeShift)) {
    blockedReasons.push('Cần Chủ cửa hàng hoặc Quản lý xác nhận xử lý chênh lệch giá/ca.');
  }

  const canResolveSale = isManager && Boolean(warehouseId) && !sale.appliedPromotionCode && !lineSummary.hasUnavailableProduct && !lineSummary.hasStockShortfall && !shiftMissing;
  const flags = {
    hasPriceChange: lineSummary.hasPriceChange,
    hasStockShortfall: lineSummary.hasStockShortfall,
    hasUnavailableProduct: lineSummary.hasUnavailableProduct,
    shiftChanged,
    shiftMissing,
    clockBeforeShift,
  };

  return {
    kind: 'sale',
    warehouseId,
    items: lineSummary.items,
    offlineTotalVnd: safeVndString(payload?.totalVnd, offlineTotalVnd),
    serverTotalAtCurrentPricesVnd: serverTotalVnd.toString(),
    totalDeltaVnd: (lineSummary.serverSubtotal - lineSummary.offlineSubtotal).toString(),
    collectedVnd: sale.amountReceivedVnd.toString(),
    activeCashSession: activeSession ? { id: activeSession.id, openedAt: activeSession.opened_at, openedByName: activeSession.opened_by_name } : null,
    flags,
    canResolveHistoricalPrice: canResolveSale,
    canResolveCurrentPriceWithDiscount: canResolveSale && lineSummary.serverSubtotal >= lineSummary.offlineSubtotal,
    requiresCashSessionReassignment: shiftChanged || clockBeforeShift,
    blockedReasons,
    explanationVi: buildSaleExplanation({
      flags,
      offlineTotalVnd: offlineTotalVnd.toString(),
      serverTotalVnd: serverTotalVnd.toString(),
      collectedVnd: sale.amountReceivedVnd.toString(),
      activeSession,
      issue,
    }),
  };
}

async function inspectNonSaleConflict(client, storeId, membership, kind, payload, issue) {
  if (kind === 'stock-count') {
    const productId = typeof payload?.productId === 'string' && UUID_PATTERN.test(payload.productId) ? payload.productId : null;
    if (!productId) throw new ApiError(400, 'validation_error', 'Thiếu mã sản phẩm cần kiểm kê.');
    if (payload?.warehouseId != null && (typeof payload.warehouseId !== 'string' || !UUID_PATTERN.test(payload.warehouseId))) {
      throw new ApiError(400, 'validation_error', 'Mã kho kiểm kê không hợp lệ.');
    }
    if (payload?.warehouseId) requireWarehouseAccess(membership, payload.warehouseId);
    const warehouse = await findAccessibleWarehouse(client, storeId, membership, payload?.warehouseId || null, { lock: false });
    const row = warehouse
      ? await client.query(
        `SELECT p.name, p.unit, ib.on_hand::text AS on_hand, ib.reserved::text AS reserved, ib.version::text AS version
         FROM products p
         LEFT JOIN inventory_balances ib ON ib.store_id = p.store_id AND ib.product_id = p.id AND ib.warehouse_id = $2
         WHERE p.store_id = $1 AND p.id = $3`,
        [storeId, warehouse.id, productId]
      )
      : { rows: [] };
    const info = row.rows[0] || null;
    return {
      kind,
      warehouseId: warehouse?.id || null,
      productId,
      productName: info?.name || 'Sản phẩm',
      unit: info?.unit || '',
      countedQuantity: payload?.count,
      expectedVersionOffline: payload?.expectedInventoryVersion ?? null,
      currentServerVersion: info?.version ? Number(info.version) : null,
      currentServerOnHand: info?.on_hand ?? null,
      currentServerReserved: info?.reserved ?? '0',
      canRequeueWithCurrentVersion: Boolean(info?.version && Number(payload?.count) >= Number(info?.reserved || 0)),
      explanationVi: info
        ? `Tồn kho "${info.name}" trên máy chủ đã thay đổi lên ${info.on_hand ?? 0} ${info.unit} (phiên bản ${info.version || 'mới'}) trong lúc ngoại tuyến.`
        : (issue?.message || 'Không tìm thấy tồn kho sản phẩm trên máy chủ.'),
    };
  }

  if (kind === 'shift-close') {
    if (!CASH_VIEW_ROLES.has(membership.role)) {
      throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền kiểm tra ca tiền mặt.');
    }
    const sessionRes = await client.query(
      `SELECT s.id, s.opening_float_vnd::text AS opening_float_vnd,
              COALESCE(SUM(CASE WHEN cm.direction = 'in' AND cm.source_type <> 'cash_session_reconciliation' THEN cm.amount_vnd ELSE 0 END), 0)::text AS cash_in_vnd,
              COALESCE(SUM(CASE WHEN cm.direction = 'out' AND cm.source_type <> 'cash_session_reconciliation' THEN cm.amount_vnd ELSE 0 END), 0)::text AS cash_out_vnd
       FROM cash_register_sessions s
       LEFT JOIN cash_movements cm ON cm.store_id = s.store_id AND cm.cash_session_id = s.id
       WHERE s.store_id = $1 AND s.status = 'open'
       GROUP BY s.id`,
      [storeId]
    );
    const active = sessionRes.rows[0] || null;
    const expectedServerVnd = active
      ? (BigInt(active.opening_float_vnd) + BigInt(active.cash_in_vnd) - BigInt(active.cash_out_vnd)).toString()
      : null;
    return {
      kind,
      activeCashSessionId: active?.id || null,
      countedCashVnd: String(payload?.countedCashVnd ?? '0'),
      offlineExpectedCashVnd: payload?.offline?.expectedCashVnd ?? null,
      serverExpectedCashVnd: expectedServerVnd,
      explanationVi: active
        ? `Số tiền mặt dự kiến hiện tại trên máy chủ là ${expectedServerVnd}đ (đếm thực tế lúc chốt: ${payload?.countedCashVnd ?? 0}đ).`
        : 'Ca tiền mặt này đã được đóng trên máy chủ rồi.',
    };
  }

  return { kind, explanationVi: issue?.message || 'Chứng từ đang chờ kiểm tra lại trên máy chủ.' };
}

function parseResolveSaleRequest(body, idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
    throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã chống gửi trùng. Hãy thử lại.');
  }
  const operationKey = typeof body?.operationKey === 'string' ? body.operationKey.trim() : '';
  if (operationKey.length < 16 || operationKey.length > 200) {
    throw new ApiError(400, 'validation_error', 'Thiếu mã chứng từ ngoại tuyến gốc.');
  }
  const resolutionMode = body?.resolutionMode;
  if (!RESOLUTION_MODES.has(resolutionMode)) {
    throw new ApiError(400, 'validation_error', 'Chế độ xử lý xung đột giá không hợp lệ.');
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 2 || reason.length > 300) {
    throw new ApiError(400, 'validation_error', 'Nhập lý do xử lý từ 2 đến 300 ký tự để lưu lịch sử.');
  }

  const salePayload = body?.salePayload;
  const sale = normalizeSale(salePayload);
  if (sale.appliedPromotionCode) {
    throw new ApiError(400, 'offline_promotion_requires_network', 'Đơn ngoại tuyến không hỗ trợ áp mã khuyến mãi trực tiếp khi xử lý xung đột.');
  }
  if (sale.items.some((item) => item.serialCodes?.length)) {
    throw new ApiError(400, 'offline_serial_requires_network', 'Đơn chứa hàng quản lý theo từng mã riêng cần bán trực tuyến để khóa mã.');
  }
  const offline = normalizeOffline(salePayload?.offline);
  if (!offline) {
    throw new ApiError(400, 'offline_metadata_invalid', 'Thiếu thông tin thời gian và thiết bị của đơn ngoại tuyến.');
  }
  const prices = expectedPrices(salePayload?.items, offline) || {};
  for (const item of sale.items) {
    if (prices[item.productId] === undefined) {
      throw new ApiError(400, 'offline_price_missing', 'Thiếu giá bán lúc lập đơn ngoại tuyến để đối chiếu an toàn.');
    }
  }
  const offlineTotalVnd = parseAmount(salePayload?.totalVnd, 'Tổng tiền đã chốt trên thiết bị');
  const assignToCurrentCashSession = Boolean(body?.assignToCurrentCashSession);

  const canonicalHash = digest({
    operationKey,
    resolutionMode,
    reason,
    assignToCurrentCashSession,
    offline,
    offlinePrices: prices,
    offlineTotalVnd: offlineTotalVnd.toString(),
    sale: {
      items: sale.items,
      discountVnd: sale.discountVnd.toString(),
      amountReceivedVnd: sale.amountReceivedVnd.toString(),
      method: sale.method,
      tenders: sale.tenders,
      customerId: sale.customerId,
      note: sale.note,
      warehouseId: sale.warehouseId,
    },
  });

  return { operationKey, resolutionMode, reason, assignToCurrentCashSession, sale, offline, prices, offlineTotalVnd, canonicalHash };
}

async function reserveIdempotency(client, storeId, actorUserId, idempotencyKey, canonicalHash) {
  const reserved = await client.query(
    `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
    [storeId, actorUserId, idempotencyKey, canonicalHash]
  );
  if (reserved.rowCount) return null;

  const previous = await client.query(
    `SELECT request_hash, response_status, response_body FROM idempotency_records
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
    [storeId, actorUserId, idempotencyKey]
  );
  const record = previous.rows[0];
  if (!record || !Buffer.from(record.request_hash).equals(canonicalHash)) {
    throw new ApiError(409, 'idempotency_conflict', 'Mã chống gửi trùng đã được dùng cho xử lý khác.');
  }
  if (!record.response_body || !record.response_status) {
    throw new ApiError(409, 'request_in_progress', 'Yêu cầu đang được xử lý. Hãy đợi một chút rồi kiểm tra lại.');
  }
  return { status: record.response_status, body: record.response_body, replayed: true };
}

function assertStockAvailable(items, productIds, productMap, balanceMap) {
  const requestedByProduct = new Map();
  for (const item of items) {
    requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) || 0) + item.quantityMilli);
  }
  for (const productId of productIds) {
    const product = productMap.get(productId);
    if (product?.serial_tracked) {
      throw new ApiError(400, 'offline_serial_requires_network', `${product.name} quản lý theo từng mã riêng, cần bán trực tuyến để khóa mã.`);
    }
    if (!product.inventory_tracked) continue;
    const balance = balanceMap.get(productId);
    if (!balance) throw new ApiError(409, 'inventory_unavailable', 'Chưa có số dư tồn kho cho một sản phẩm trong đơn.');
    const available = parseDbMilli(balance.on_hand) - parseDbMilli(balance.reserved);
    if ((requestedByProduct.get(productId) || 0) > available) {
      throw new ApiError(409, 'insufficient_stock', `${product.name} không đủ tồn kho để chốt đơn. Hãy nhập hàng thêm rồi thử lại.`);
    }
  }
}

function buildResolvedFinancials(reqData, productMap) {
  const { sale, prices, resolutionMode, offlineTotalVnd } = reqData;
  let offlineSubtotal = 0n;
  let serverSubtotal = 0n;
  const priceComparisons = [];
  const resolvedLines = [];

  for (const item of sale.items) {
    const product = productMap.get(item.productId);
    const offlinePrice = BigInt(prices[item.productId]);
    const serverPrice = BigInt(product.sale_price_vnd);
    const qtyBig = BigInt(item.quantityMilli);
    const offlineGross = (offlinePrice * qtyBig + 500n) / 1000n;
    const serverGross = (serverPrice * qtyBig + 500n) / 1000n;
    offlineSubtotal += offlineGross;
    serverSubtotal += serverGross;

    priceComparisons.push({
      productId: product.id,
      name: product.name,
      offlineUnitPriceVnd: offlinePrice.toString(),
      serverUnitPriceVnd: serverPrice.toString(),
    });
    const useHistorical = resolutionMode === 'accept_historical_price';
    resolvedLines.push({
      ...item,
      product,
      price: useHistorical ? offlinePrice : serverPrice,
      cost: BigInt(product.cost_vnd),
      grossVnd: useHistorical ? offlineGross : serverGross,
    });
  }

  if (offlineSubtotal > MAX_BIGINT || serverSubtotal > MAX_BIGINT) {
    throw new ApiError(400, 'validation_error', 'Tổng tiền đơn hàng vượt giới hạn lưu trữ.');
  }
  if (offlineSubtotal < sale.discountVnd || offlineSubtotal - sale.discountVnd !== offlineTotalVnd) {
    throw new ApiError(400, 'offline_total_changed', 'Tổng tiền đơn ngoại tuyến không khớp với giá bán và giảm giá lúc chốt trên máy.');
  }

  let conflictAdjustmentDiscountVnd = 0n;
  if (resolutionMode === 'accept_current_price_with_discount') {
    if (serverSubtotal < offlineSubtotal) {
      throw new ApiError(409, 'offline_discount_inapplicable', 'Giá mới trên máy chủ thấp hơn giá đã bán lúc ngoại tuyến; hãy chọn giữ giá lịch sử hoặc lập lại đơn.');
    }
    conflictAdjustmentDiscountVnd = serverSubtotal - offlineSubtotal;
  }

  const subtotal = resolutionMode === 'accept_historical_price' ? offlineSubtotal : serverSubtotal;
  const totalDiscountVnd = sale.discountVnd + conflictAdjustmentDiscountVnd;
  const total = subtotal - totalDiscountVnd;
  if (total > MAX_BIGINT || totalDiscountVnd > MAX_BIGINT) {
    throw new ApiError(400, 'validation_error', 'Tổng tiền hoặc chiết khấu vượt giới hạn lưu trữ.');
  }

  const nonCashReceived = sale.tenders.filter((t) => t.method !== 'cash').reduce((sum, t) => sum + t.amountReceivedVnd, 0n);
  const cashTender = sale.tenders.find((t) => t.method === 'cash');
  const cashReceived = cashTender ? cashTender.amountReceivedVnd : 0n;
  if (nonCashReceived > total || (sale.amountReceivedVnd > total && cashReceived === 0n)) {
    throw new ApiError(400, 'validation_error', 'Chỉ tiền mặt được nhận dư để thối; tổng thanh toán không tiền mặt không được vượt tổng đơn.');
  }
  const cashApplied = cashReceived < (total - nonCashReceived) ? cashReceived : (total - nonCashReceived);
  const paid = nonCashReceived + cashApplied;
  if (paid < total && !sale.customerId) {
    throw new ApiError(400, 'customer_required', 'Cần chọn khách hàng để ghi nhận phần còn nợ.');
  }

  return {
    resolvedLines,
    priceComparisons,
    serverSubtotal,
    conflictAdjustmentDiscountVnd,
    subtotal,
    totalDiscountVnd,
    total,
    cashReceived,
    paid,
    change: sale.amountReceivedVnd - paid,
    allocatedDiscount: distributeDiscount(resolvedLines, totalDiscountVnd, subtotal || 1n),
    appliedTenders: sale.tenders
      .map((t) => ({ method: t.method, amountVnd: t.method === 'cash' ? cashApplied : t.amountReceivedVnd }))
      .filter((t) => t.amountVnd > 0n),
  };
}

async function prepareResolvedSaleData(client, storeId, resolverUserId, reqData) {
  const { operationKey, assignToCurrentCashSession, sale, offline } = reqData;

  // Serialize concurrent attempts on the same offline operationKey within the store
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [storeId, operationKey]);
  const alreadyRecorded = await client.query(
    `SELECT entity_id FROM offline_operation_receipts WHERE store_id = $1 AND operation_key = $2 LIMIT 1`,
    [storeId, operationKey]
  );
  if (alreadyRecorded.rowCount) {
    throw new ApiError(409, 'offline_already_synced', 'Đơn ngoại tuyến này đã được ghi nhận trên máy chủ trước đó; không ghi doanh thu lần hai.');
  }

  let cashierId = resolverUserId;
  if (offline.actorUserId && offline.actorUserId !== resolverUserId) {
    const actorMember = await client.query(
      `SELECT m.user_id FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.store_id = $1 AND m.user_id = $2
         AND m.status = 'active' AND u.status = 'active'
         AND m.role IN ('owner', 'manager', 'cashier')`,
      [storeId, offline.actorUserId]
    );
    if (!actorMember.rowCount) {
      throw new ApiError(403, 'offline_actor_not_in_store', 'Tài khoản ghi đơn ngoại tuyến không còn hoạt động hoặc không thuộc cửa hàng.');
    }
    cashierId = offline.actorUserId;
  }

  await client.query(
    `SELECT set_config('app.offline_occurred_at', $1, true), set_config('app.offline_cash_session_id', $2, true)`,
    [offline.occurredAt, assignToCurrentCashSession ? '' : (offline.cashSessionId || '')]
  );

  let customerCreditLimit = null;
  if (sale.customerId) {
    const customer = await client.query(
      `SELECT id, credit_limit_vnd::text AS credit_limit_vnd FROM customers WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`,
      [storeId, sale.customerId]
    );
    if (!customer.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng đang hoạt động.');
    customerCreditLimit = customer.rows[0].credit_limit_vnd;
  }

  const warehouseId = await resolveWarehouseId(client, storeId, sale.warehouseId, { lock: true });
  if (!warehouseId) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho bán hàng đang hoạt động.');

  const { productIds, productMap, balanceMap } = await loadProductsAndBalances(client, storeId, warehouseId, sale.items, { lock: true });
  if (productMap.size !== productIds.length || [...productMap.values()].some((p) => p.status !== 'active')) {
    throw new ApiError(409, 'product_unavailable', 'Có sản phẩm đã ngừng bán hoặc không còn trong cửa hàng.');
  }
  assertStockAvailable(sale.items, productIds, productMap, balanceMap);

  const financials = buildResolvedFinancials(reqData, productMap);
  let creditUsed = 0n;
  if (sale.customerId && financials.paid < financials.total) {
    const creditBalance = await client.query(
      `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS balance_vnd
       FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2`,
      [storeId, sale.customerId]
    );
    const currentBalance = BigInt(creditBalance.rows[0].balance_vnd);
    const shortfall = financials.total - financials.paid;
    if (customerCreditLimit !== null && currentBalance + shortfall > BigInt(customerCreditLimit)) {
      throw new ApiError(409, 'customer_credit_limit', 'Khoản nợ mới vượt hạn mức của khách.');
    }
    const available = -currentBalance;
    if (available > 0n) creditUsed = available < shortfall ? available : shortfall;
  }

  let cashSessionId = null;
  if (financials.cashReceived > 0n || financials.change > 0n) {
    if (assignToCurrentCashSession) {
      await client.query(`SELECT set_config('app.offline_occurred_at', '', true), set_config('app.offline_cash_session_id', '', true)`);
      cashSessionId = await lockActiveCashSession(client, storeId);
      await client.query(`SELECT set_config('app.offline_occurred_at', $1, true)`, [offline.occurredAt]);
    } else {
      cashSessionId = await lockActiveCashSession(client, storeId);
    }
  }

  return { cashierId, warehouseId, cashSessionId, creditUsed, ...financials };
}

async function insertResolvedOrderLinesAndStock(client, storeId, resolverUserId, order, prepared) {
  const { resolvedLines, allocatedDiscount, warehouseId } = prepared;
  for (let i = 0; i < resolvedLines.length; i += 1) {
    const line = resolvedLines[i];
    const lineTotal = line.grossVnd - allocatedDiscount[i];
    await client.query(
      `INSERT INTO order_lines (store_id, order_id, product_id, product_name_snapshot, sku_snapshot,
                                unit_snapshot, quantity, unit_price_vnd, unit_cost_vnd, discount_vnd, line_total_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [storeId, order.id, line.product.id, line.product.name, line.product.sku, line.product.unit,
        quantityText(line.quantityMilli), line.price.toString(), line.cost.toString(), allocatedDiscount[i].toString(), lineTotal.toString()]
    );
    if (!line.product.inventory_tracked) continue;
    const updatedBal = await client.query(
      `UPDATE inventory_balances SET on_hand = on_hand - $3::numeric, version = version + 1, updated_at = now()
       WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $4
       RETURNING on_hand::text AS on_hand`,
      [storeId, line.product.id, quantityText(line.quantityMilli), warehouseId]
    );
    await client.query(
      `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                         reason, source_type, source_id, actor_user_id)
       VALUES ($1, $2, $3, 'sale', -$4::numeric, $5::numeric, $6, 'order', $7, $8)`,
      [storeId, warehouseId, line.product.id, quantityText(line.quantityMilli), updatedBal.rows[0].on_hand,
        `Bán hàng (xử lý ngoại tuyến) ${order.order_number}`, order.id, resolverUserId]
    );
  }
}

async function recordResolvedPaymentsAndCash(client, storeId, resolverUserId, order, sale, reqData, prepared) {
  const { appliedTenders, creditUsed, cashSessionId, change } = prepared;
  for (const tender of appliedTenders) {
    await client.query(
      `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, recorded_by)
       VALUES ($1, $2, $3, 'succeeded', $4, $5)`,
      [storeId, order.id, tender.method, tender.amountVnd.toString(), resolverUserId]
    );
  }
  if (creditUsed > 0n) {
    await client.query(
      `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, provider, recorded_by)
       VALUES ($1, $2, 'other', 'succeeded', $3, 'customer_credit', $4)`,
      [storeId, order.id, creditUsed.toString(), resolverUserId]
    );
  }
  if (reqData.assignToCurrentCashSession) {
    // Reassigned cash drawer inflows belong to the active shift's wall-clock window
    await client.query(`SELECT set_config('app.offline_occurred_at', '', true)`);
  }
  for (const tender of sale.tenders) {
    if (tender.amountReceivedVnd <= 0n) continue;
    await insertCashMovement(client, {
      storeId,
      direction: 'in',
      category: 'Bán hàng',
      amountVnd: tender.amountReceivedVnd.toString(),
      method: tender.method,
      sourceType: 'order_payment',
      sourceId: order.id,
      note: `Thu đơn ${order.order_number}`,
      actorUserId: resolverUserId,
      cashSessionId: tender.method === 'cash' ? cashSessionId : null,
      counterpartyKind: sale.customerId ? 'customer' : null,
      counterpartyId: sale.customerId || null,
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
      note: `Thối tiền đơn ${order.order_number}`,
      actorUserId: resolverUserId,
      cashSessionId,
      counterpartyKind: sale.customerId ? 'customer' : null,
      counterpartyId: sale.customerId || null,
    });
  }
  if (reqData.assignToCurrentCashSession) {
    await client.query(`SELECT set_config('app.offline_occurred_at', $1, true)`, [reqData.offline.occurredAt]);
  }
}

async function recordResolvedLedgerReceiptAndAudit(client, storeId, resolverUserId, order, reqData, prepared) {
  const { operationKey, resolutionMode, reason, assignToCurrentCashSession, sale, offline, offlineTotalVnd } = reqData;
  const { cashierId, cashSessionId, total, paid, serverSubtotal, conflictAdjustmentDiscountVnd, priceComparisons } = prepared;
  if (sale.customerId) {
    if (total > 0n) {
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'sale_debit', $3, 'order', $4, $5, $6)`,
        [storeId, sale.customerId, total.toString(), order.id, `Đơn ${order.order_number}`, resolverUserId]
      );
    }
    if (paid > 0n) {
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6)`,
        [storeId, sale.customerId, paid.toString(), order.id, `Thu tiền đơn ${order.order_number}`, resolverUserId]
      );
    }
  }

  try {
    await client.query(
      `INSERT INTO offline_operation_receipts (store_id, actor_user_id, operation_key, device_id, kind, entity_id, client_occurred_at)
       VALUES ($1, $2, $3, $4, 'sale', $5, $6)`,
      [storeId, cashierId, operationKey, offline.deviceId, order.id, offline.occurredAt]
    );
  } catch (err) {
    if (err.code === '23505') {
      throw new ApiError(409, 'offline_already_synced', 'Đơn ngoại tuyến này đã được ghi nhận trên máy chủ trước đó.');
    }
    throw err;
  }

  await client.query(
    `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, 'offline_conflict.sale_resolved', 'order', $3, $4::jsonb)`,
    [storeId, resolverUserId, order.id, JSON.stringify({
      operationKey,
      resolutionMode,
      reason,
      originalActorUserId: cashierId,
      assignToCurrentCashSession,
      originalCashSessionId: offline.cashSessionId,
      assignedCashSessionId: cashSessionId,
      offlineTotalVnd: offlineTotalVnd.toString(),
      serverPriceSubtotalVnd: serverSubtotal.toString(),
      conflictAdjustmentDiscountVnd: conflictAdjustmentDiscountVnd.toString(),
      priceComparisons,
    })]
  );
}

async function persistResolvedSaleOrder(client, storeId, resolverUserId, reqData, prepared) {
  const { resolutionMode, reason, sale, offlineTotalVnd } = reqData;
  const {
    cashierId, warehouseId, creditUsed, resolvedLines, serverSubtotal,
    conflictAdjustmentDiscountVnd, subtotal, totalDiscountVnd, total,
    cashReceived, paid, change, allocatedDiscount,
  } = prepared;

  const seqRes = await client.query(
    `UPDATE store_sequences SET next_order_number = next_order_number + 1
     WHERE store_id = $1 RETURNING next_order_number - 1 AS order_number`,
    [storeId]
  );
  if (!seqRes.rowCount) throw new Error('Store order sequence is missing.');
  const orderNumber = `SL-${seqRes.rows[0].order_number}`;
  const noteCombined = sale.note
    ? `${sale.note} [Xử lý đơn ngoại tuyến: ${reason}]`.slice(0, 500)
    : `[Xử lý đơn ngoại tuyến: ${reason}]`.slice(0, 500);

  const orderRes = await client.query(
    `INSERT INTO orders (store_id, order_number, customer_id, cashier_id, warehouse_id, status, subtotal_vnd,
                         discount_vnd, tax_vnd, total_vnd, cash_received_vnd, cash_change_vnd, note)
     VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, 0, $8, $9, $10, $11)
     RETURNING id, order_number, status, subtotal_vnd::text AS subtotal_vnd,
               discount_vnd::text AS discount_vnd, total_vnd::text AS total_vnd,
               cash_received_vnd::text AS cash_received_vnd, cash_change_vnd::text AS cash_change_vnd, occurred_at`,
    [storeId, orderNumber, sale.customerId, cashierId, warehouseId, subtotal.toString(), totalDiscountVnd.toString(),
      total.toString(), cashReceived.toString(), change.toString(), noteCombined]
  );
  const order = orderRes.rows[0];

  await insertResolvedOrderLinesAndStock(client, storeId, resolverUserId, order, prepared);
  await recordResolvedPaymentsAndCash(client, storeId, resolverUserId, order, sale, reqData, prepared);
  await recordResolvedLedgerReceiptAndAudit(client, storeId, resolverUserId, order, reqData, prepared);

  return {
    resolution: {
      mode: resolutionMode,
      reason,
      orderId: order.id,
      orderNumber: order.order_number,
      originalTotalVnd: offlineTotalVnd.toString(),
      serverPriceSubtotalVnd: serverSubtotal.toString(),
      conflictAdjustmentDiscountVnd: conflictAdjustmentDiscountVnd.toString(),
    },
    order: {
      id: order.id,
      number: order.order_number,
      status: order.status,
      subtotalVnd: order.subtotal_vnd,
      discountVnd: order.discount_vnd,
      totalVnd: order.total_vnd,
      paidVnd: (paid + creditUsed).toString(),
      dueVnd: (total - paid - creditUsed).toString(),
      cashReceivedVnd: order.cash_received_vnd,
      changeVnd: change.toString(),
      occurredAt: order.occurred_at,
      items: resolvedLines.map((line, i) => ({
        productId: line.product.id,
        name: line.product.name,
        sku: line.product.sku,
        quantity: quantityText(line.quantityMilli),
        unitPriceVnd: line.price.toString(),
        discountVnd: allocatedDiscount[i].toString(),
        lineTotalVnd: (line.grossVnd - allocatedDiscount[i]).toString(),
      })),
    },
  };
}

function registerOfflineConflictRoutes(app, { pool, env }) {
  app.post('/api/stores/:storeId/offline-conflicts/inspect', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    const body = request.body || {};
    const kind = String(body.kind || '');
    const operationKey = typeof body.operationKey === 'string' ? body.operationKey.trim() : '';
    if (!VALID_KINDS.has(kind)) throw new ApiError(400, 'validation_error', 'Loại chứng từ không hợp lệ.');
    if (operationKey.length < 16 || operationKey.length > 200) {
      throw new ApiError(400, 'validation_error', 'Mã chứng từ chờ không hợp lệ.');
    }

    const report = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ALL_STORE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản không có quyền xem chứng từ cửa hàng này.');
      }
      const existing = await client.query(
        `SELECT entity_id, actor_user_id, received_at FROM offline_operation_receipts
         WHERE store_id = $1 AND operation_key = $2 LIMIT 1`,
        [storeId, operationKey]
      );
      if (existing.rowCount) {
        return {
          alreadySynced: true,
          existingEntityId: existing.rows[0].entity_id,
          receivedAt: existing.rows[0].received_at,
          kind,
          explanationVi: 'Chứng từ này đã được đồng bộ thành công lên máy chủ trước đó. Có thể đánh dấu hoàn tất trên thiết bị.',
        };
      }
      const details = kind === 'sale'
        ? await inspectSaleConflict(client, storeId, membership, body.payload || {}, body.issue || null)
        : await inspectNonSaleConflict(client, storeId, membership, kind, body.payload || {}, body.issue || null);
      return { alreadySynced: false, ...details };
    });
    return reply.code(200).send(report);
  });

  app.post('/api/stores/:storeId/offline-conflicts/resolve-sale', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    const reqData = parseResolveSaleRequest(request.body || {}, request.headers['idempotency-key']);
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!RESOLVE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Chỉ Chủ cửa hàng hoặc Quản lý mới được phép xử lý đơn ngoại tuyến bị lệch giá/ca.');
      }
      const replay = await reserveIdempotency(client, storeId, auth.userId, request.headers['idempotency-key'], reqData.canonicalHash);
      if (replay) return replay;

      const prepared = await prepareResolvedSaleData(client, storeId, auth.userId, reqData);
      const responseBody = await persistResolvedSaleOrder(client, storeId, auth.userId, reqData, prepared);

      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, request.headers['idempotency-key'], JSON.stringify(responseBody)]
      );
      return { status: 201, body: responseBody, replayed: false };
    });

    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });
}

module.exports = { registerOfflineConflictRoutes };
