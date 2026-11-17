'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');
const { findAccessibleWarehouse, requireWarehouseAccess, allowedWarehouseIds } = require('./warehouse-access');
const { quantityMilli, quantityText } = require('./sales');

const MAX_BIGINT = 9223372036854775807n;
const MAX_LINES = 50;
const RETURN_ROLES = new Set(['owner', 'manager', 'stockkeeper', 'accountant']);
const FINANCE_ROLES = new Set(['owner', 'manager', 'accountant']);
const METHODS = new Set(['cash', 'bank_transfer', 'bank_qr', 'card', 'other']);

function parseVnd(value, label) {
  if (value === undefined || value === null || value === '') return 0n;
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof text !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(text)) {
    throw new ApiError(400, 'validation_error', `${label} phải là số VND nguyên không âm.`);
  }
  const parsed = BigInt(text);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return parsed;
}

function parseDbMilli(value) {
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(value == null ? '0' : value).trim());
  if (!match) return 0;
  const sign = match[1] ? -1 : 1;
  return sign * (Number(match[2]) * 1000 + Number((match[3] || '').slice(0, 3).padEnd(3, '0')));
}

function normalizeSupplierReturn(body) {
  const supplierId = typeof body?.supplierId === 'string' ? body.supplierId.trim().toLowerCase() : '';
  if (!UUID_PATTERN.test(supplierId)) {
    throw new ApiError(400, 'validation_error', 'Chọn nhà cung cấp hợp lệ để lập phiếu trả.');
  }
  const purchaseIdInput = body?.purchaseId || null;
  if (purchaseIdInput !== null && (typeof purchaseIdInput !== 'string' || !UUID_PATTERN.test(purchaseIdInput))) {
    throw new ApiError(400, 'validation_error', 'Mã phiếu nhập liên kết không hợp lệ.');
  }
  const warehouseIdInput = body?.warehouseId || null;
  if (warehouseIdInput !== null && (typeof warehouseIdInput !== 'string' || !UUID_PATTERN.test(warehouseIdInput))) {
    throw new ApiError(400, 'validation_error', 'Mã kho xuất trả không hợp lệ.');
  }
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 2 || reason.length > 300) {
    throw new ApiError(400, 'validation_error', 'Nhập lý do trả nhà cung cấp từ 2 đến 300 ký tự.');
  }

  const rawItems = Array.isArray(body?.items) ? body.items : [];
  if (!rawItems.length || rawItems.length > MAX_LINES) {
    throw new ApiError(400, 'validation_error', `Phiếu trả cần từ 1 đến ${MAX_LINES} mặt hàng.`);
  }
  const seen = new Set();
  const items = rawItems.map((raw) => {
    const productId = typeof raw?.productId === 'string' ? raw.productId.toLowerCase() : '';
    if (!UUID_PATTERN.test(productId)) throw new ApiError(400, 'validation_error', 'Một dòng hàng có mã sản phẩm không hợp lệ.');
    if (seen.has(productId)) throw new ApiError(400, 'validation_error', 'Mỗi sản phẩm chỉ xuất hiện một lần trên phiếu trả.');
    seen.add(productId);
    const hasUnitCost = raw?.unitCostVnd !== undefined && raw?.unitCostVnd !== null && raw?.unitCostVnd !== '';
    return {
      productId,
      quantityMilli: quantityMilli(raw?.quantity),
      unitCostVnd: hasUnitCost ? parseVnd(raw.unitCostVnd, 'Đơn giá trả lại') : null,
    };
  });

  const refundReceivedVnd = parseVnd(body?.refundReceivedVnd ?? 0, 'Số tiền nhà cung cấp hoàn lại');
  const refundMethod = body?.refundMethod || 'cash';
  if (!METHODS.has(refundMethod)) {
    throw new ApiError(400, 'validation_error', 'Phương thức nhận hoàn tiền không hợp lệ.');
  }

  return {
    supplierId,
    purchaseId: purchaseIdInput ? purchaseIdInput.toLowerCase() : null,
    warehouseId: warehouseIdInput ? warehouseIdInput.toLowerCase() : null,
    reason,
    items,
    refundReceivedVnd,
    refundMethod,
  };
}

function digestReturn(value) {
  return createHash('sha256')
    .update(JSON.stringify(value, (_k, entry) => (typeof entry === 'bigint' ? entry.toString() : entry)))
    .digest();
}

async function assertLinkedPurchaseAllowances(client, storeId, membership, supplierId, purchaseId, items) {
  const purRes = await client.query(
    `SELECT id, purchase_number, supplier_id, warehouse_id, status
     FROM purchases WHERE store_id = $1 AND id = $2 FOR UPDATE`,
    [storeId, purchaseId]
  );
  if (!purRes.rowCount || purRes.rows[0].status === 'cancelled') {
    throw new ApiError(404, 'purchase_not_found', 'Không tìm thấy phiếu nhập hàng cần trả.');
  }
  const purchase = purRes.rows[0];
  requireWarehouseAccess(membership, purchase.warehouse_id);
  if (purchase.supplier_id !== supplierId) {
    throw new ApiError(409, 'supplier_mismatch', 'Phiếu nhập hàng đã chọn không thuộc nhà cung cấp này.');
  }

  const lineRes = await client.query(
    `SELECT product_id, quantity_received::text AS quantity_received, unit_cost_vnd::text AS unit_cost_vnd
     FROM purchase_lines WHERE store_id = $1 AND purchase_id = $2`,
    [storeId, purchaseId]
  );
  const purchasedByProduct = new Map(lineRes.rows.map((l) => [
    l.product_id,
    { receivedMilli: parseDbMilli(l.quantity_received), unitCostVnd: BigInt(l.unit_cost_vnd) },
  ]));

  const priorReturns = await client.query(
    `SELECT metadata->'items' AS items
     FROM audit_events
     WHERE store_id = $1 AND action = 'supplier_return.created' AND metadata->>'purchaseId' = $2`,
    [storeId, purchaseId]
  );
  const returnedSoFar = new Map();
  for (const row of priorReturns.rows) {
    for (const entry of Array.isArray(row.items) ? row.items : []) {
      if (entry?.productId) {
        returnedSoFar.set(entry.productId, (returnedSoFar.get(entry.productId) || 0) + parseDbMilli(entry.quantity));
      }
    }
  }

  const purchaseCosts = new Map();
  for (const item of items) {
    const pLine = purchasedByProduct.get(item.productId);
    if (!pLine) throw new ApiError(400, 'purchase_line_invalid', 'Có sản phẩm trả lại không nằm trong phiếu nhập liên kết.');
    if (item.unitCostVnd !== null && item.unitCostVnd !== pLine.unitCostVnd) {
      throw new ApiError(400, 'validation_error', 'Đơn giá trả liên kết phiếu nhập phải khớp đúng giá vốn trên phiếu nhập.');
    }
    const alreadyReturned = returnedSoFar.get(item.productId) || 0;
    if (item.quantityMilli > pLine.receivedMilli - alreadyReturned) {
      throw new ApiError(409, 'return_quantity_exceeded', 'Số lượng trả vượt quá số lượng đã nhập còn lại của phiếu.');
    }
    purchaseCosts.set(item.productId, pLine.unitCostVnd);
  }
  return { purchaseNumber: purchase.purchase_number, purchaseCosts };
}

async function prepareSupplierReturnData(client, storeId, membership, req) {
  const canAdjustCost = FINANCE_ROLES.has(membership.role);
  if (!req.purchaseId && !canAdjustCost && req.items.some((i) => i.unitCostVnd !== null)) {
    throw new ApiError(403, 'forbidden', 'Chỉ Chủ cửa hàng, Quản lý hoặc Kế toán được tự nhập đơn giá trả ngoài phiếu nhập.');
  }

  // Match lock order with finance.js / purchases.js: stores -> cash_register_sessions -> suppliers
  if (req.refundReceivedVnd > 0n && req.refundMethod === 'cash') {
    await client.query('SELECT id FROM stores WHERE id = $1 FOR UPDATE', [storeId]);
  }
  const cashSessionId = req.refundReceivedVnd > 0n && req.refundMethod === 'cash'
    ? await lockActiveCashSession(client, storeId)
    : null;

  const supRes = await client.query(
    `SELECT id, name FROM suppliers WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`,
    [storeId, req.supplierId]
  );
  if (!supRes.rowCount) throw new ApiError(404, 'supplier_not_found', 'Không tìm thấy nhà cung cấp đang hoạt động.');
  const supplier = supRes.rows[0];

  if (req.warehouseId) requireWarehouseAccess(membership, req.warehouseId);
  const warehouse = await findAccessibleWarehouse(client, storeId, membership, req.warehouseId, { lock: true });
  if (!warehouse) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho xuất trả hàng đang hoạt động.');

  const linked = req.purchaseId
    ? await assertLinkedPurchaseAllowances(client, storeId, membership, supplier.id, req.purchaseId, req.items)
    : { purchaseNumber: null, purchaseCosts: new Map() };

  const productIds = req.items.map((i) => i.productId).sort();
  const prodRes = await client.query(
    `SELECT id, sku, name, unit, cost_vnd::text AS cost_vnd, inventory_tracked, status
     FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
    [storeId, productIds]
  );
  const prodMap = new Map(prodRes.rows.map((p) => [p.id, p]));
  if (prodMap.size !== productIds.length || prodRes.rows.some((p) => p.status !== 'active')) {
    throw new ApiError(409, 'product_unavailable', 'Có sản phẩm không tồn tại hoặc đã ngừng kinh doanh.');
  }

  const balRes = await client.query(
    `SELECT product_id, on_hand::text AS on_hand, reserved::text AS reserved
     FROM inventory_balances
     WHERE store_id = $1 AND warehouse_id = $2 AND product_id = ANY($3::uuid[])
     ORDER BY product_id FOR UPDATE`,
    [storeId, warehouse.id, productIds]
  );
  const balMap = new Map(balRes.rows.map((r) => [r.product_id, r]));

  let totalVnd = 0n;
  const preparedLines = req.items.map((item) => {
    const product = prodMap.get(item.productId);
    if (product.inventory_tracked) {
      const bal = balMap.get(item.productId);
      const available = bal ? parseDbMilli(bal.on_hand) - parseDbMilli(bal.reserved) : 0;
      if (item.quantityMilli > available) {
        throw new ApiError(409, 'insufficient_stock', `${product.name} không đủ tồn khả dụng tại kho để trả nhà cung cấp.`);
      }
    }
    const unitCost = req.purchaseId
      ? linked.purchaseCosts.get(item.productId)
      : (item.unitCostVnd ?? BigInt(product.cost_vnd));
    const lineTotalVnd = (unitCost * BigInt(item.quantityMilli) + 500n) / 1000n;
    totalVnd += lineTotalVnd;
    if (lineTotalVnd > MAX_BIGINT || totalVnd > MAX_BIGINT) {
      throw new ApiError(400, 'validation_error', 'Tổng giá trị phiếu trả vượt giới hạn lưu trữ.');
    }
    return { ...item, product, unitCost, lineTotalVnd };
  });

  if (req.refundReceivedVnd > totalVnd) {
    throw new ApiError(400, 'validation_error', 'Tiền nhà cung cấp hoàn lại không được vượt tổng giá trị hàng trả.');
  }

  return { warehouse, supplier, purchaseNumber: linked.purchaseNumber, preparedLines, totalVnd, cashSessionId };
}

async function deductReturnStock(client, storeId, actorUserId, warehouse, supplier, returnId, returnNumber, preparedLines) {
  const resultItems = [];
  for (const line of preparedLines) {
    const qty = quantityText(line.quantityMilli);
    if (line.product.inventory_tracked) {
      const bal = await client.query(
        `UPDATE inventory_balances SET on_hand = on_hand - $4::numeric, version = version + 1, updated_at = now()
         WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3
         RETURNING on_hand::text AS on_hand`,
        [storeId, warehouse.id, line.product.id, qty]
      );
      await client.query(
        `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                           reason, source_type, source_id, actor_user_id)
         VALUES ($1, $2, $3, 'adjustment', -$4::numeric, $5::numeric, $6, 'supplier_return', $7, $8)`,
        [storeId, warehouse.id, line.product.id, qty, bal.rows[0].on_hand,
          `Trả NCC ${supplier.name} · ${returnNumber}`, returnId, actorUserId]
      );
    }
    resultItems.push({
      productId: line.product.id,
      sku: line.product.sku,
      name: line.product.name,
      unit: line.product.unit,
      quantity: qty,
      unitCostVnd: line.unitCost.toString(),
      lineTotalVnd: line.lineTotalVnd.toString(),
    });
  }
  return resultItems;
}

async function persistSupplierReturn(client, storeId, actorUserId, req, prepared) {
  const { warehouse, supplier, purchaseNumber, preparedLines, totalVnd, cashSessionId } = prepared;
  const returnId = randomUUID();
  const returnNumber = `SR-${Date.now().toString().slice(-6)}-${returnId.slice(0, 4).toUpperCase()}`;

  const resultItems = await deductReturnStock(client, storeId, actorUserId, warehouse, supplier, returnId, returnNumber, preparedLines);

  if (totalVnd > 0n) {
    await client.query(
      `INSERT INTO supplier_ledger_entries (store_id, supplier_id, entry_type, decreases_payable_vnd, source_type, source_id, note, actor_user_id)
       VALUES ($1, $2, 'reversal', $3, 'supplier_return', $4, $5, $6)`,
      [storeId, supplier.id, totalVnd.toString(), returnId, `Trả hàng NCC · ${returnNumber}`, actorUserId]
    );
  }
  if (req.refundReceivedVnd > 0n) {
    await client.query(
      `INSERT INTO supplier_ledger_entries (store_id, supplier_id, entry_type, increases_payable_vnd, source_type, source_id, note, actor_user_id)
       VALUES ($1, $2, 'manual_credit', $3, 'supplier_return_refund', $4, $5, $6)`,
      [storeId, supplier.id, req.refundReceivedVnd.toString(), returnId, `NCC hoàn tiền · ${returnNumber}`, actorUserId]
    );
    await client.query(
      `INSERT INTO cash_movements (store_id, direction, category, amount_vnd, method, source_type, source_id, note, actor_user_id, cash_session_id)
       VALUES ($1, 'in', 'Hoàn tiền nhà cung cấp', $2, $3, 'supplier_return_refund', $4, $5, $6, $7)`,
      [storeId, req.refundReceivedVnd.toString(), req.refundMethod, returnId,
        `NCC ${supplier.name} hoàn tiền · ${returnNumber}`, actorUserId, cashSessionId]
    );
  }

  const metadata = {
    returnNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    purchaseId: req.purchaseId,
    purchaseNumber,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    totalVnd: totalVnd.toString(),
    refundReceivedVnd: req.refundReceivedVnd.toString(),
    refundMethod: req.refundMethod,
    netPayableReductionVnd: (totalVnd - req.refundReceivedVnd).toString(),
    items: resultItems,
  };

  await client.query(
    `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
     VALUES ($1, $2, 'supplier_return.created', 'supplier_return', $3, $4, $5::jsonb)`,
    [storeId, actorUserId, returnId, req.reason, JSON.stringify(metadata)]
  );

  return {
    supplierReturn: { id: returnId, ...metadata, reason: req.reason, occurredAt: new Date().toISOString() },
  };
}

function registerSupplierReturnRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/supplier-returns', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    const supplierFilter = request.query?.supplierId || null;
    if (supplierFilter && !UUID_PATTERN.test(supplierFilter)) {
      throw new ApiError(400, 'validation_error', 'Mã nhà cung cấp không hợp lệ.');
    }
    const warehouseFilter = request.query?.warehouseId || null;
    if (warehouseFilter && !UUID_PATTERN.test(warehouseFilter)) {
      throw new ApiError(400, 'validation_error', 'Mã kho không hợp lệ.');
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!RETURN_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản không có quyền xem phiếu trả nhà cung cấp.');
      }
      const allowedWh = allowedWarehouseIds(membership);
      const rows = await client.query(
        `SELECT ae.entity_id AS id, ae.reason, ae.occurred_at, ae.metadata, u.display_name AS actor_name
         FROM audit_events ae
         JOIN users u ON u.id = ae.actor_user_id
         WHERE ae.store_id = $1 AND ae.action = 'supplier_return.created'
           AND ($2::uuid IS NULL OR ae.metadata->>'supplierId' = $2::text)
           AND ($3::uuid IS NULL OR ae.metadata->>'warehouseId' = $3::text)
           AND ($4::boolean = false OR (ae.metadata->>'warehouseId')::uuid = ANY($5::uuid[]))
         ORDER BY ae.occurred_at DESC, ae.id DESC
         LIMIT 100`,
        [storeId, supplierFilter, warehouseFilter, allowedWh !== null, allowedWh || []]
      );
      return {
        supplierReturns: rows.rows.map((r) => ({
          id: r.id,
          reason: r.reason,
          actorName: r.actor_name,
          occurredAt: r.occurred_at,
          ...(r.metadata || {}),
        })),
      };
    });
  });

  app.post('/api/stores/:storeId/supplier-returns', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã chống gửi trùng. Hãy thử lại.');
    }

    const req = normalizeSupplierReturn(request.body || {});
    const reqHash = digestReturn(req);

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!RETURN_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản không có quyền lập phiếu trả nhà cung cấp.');
      }
      if (req.refundReceivedVnd > 0n && !FINANCE_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Chỉ Chủ cửa hàng, Quản lý hoặc Kế toán được ghi nhận tiền hoàn từ nhà cung cấp.');
      }

      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, reqHash]
      );
      if (!reserved.rowCount) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const rec = previous.rows[0];
        if (!rec || !Buffer.from(rec.request_hash).equals(reqHash)) {
          throw new ApiError(409, 'idempotency_conflict', 'Mã phiếu trả NCC đã được dùng cho nội dung khác.');
        }
        if (!rec.response_body || !rec.response_status) {
          throw new ApiError(409, 'request_in_progress', 'Phiếu trả NCC đang được xử lý.');
        }
        return { status: rec.response_status, body: rec.response_body, replayed: true };
      }

      const prepared = await prepareSupplierReturnData(client, storeId, membership, req);
      const responseBody = await persistSupplierReturn(client, storeId, auth.userId, req, prepared);

      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(responseBody)]
      );
      return { status: 201, body: responseBody, replayed: false };
    });

    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });
}

module.exports = { registerSupplierReturnRoutes, normalizeSupplierReturn };
