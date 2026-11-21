'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { lockActiveCashSession } = require('./cash-register');
const { insertCashMovement } = require('./cashbook-ledger');
const { quantityMilli, quantityText, distributeDiscount } = require('./sales');
const { requirePermission } = require('./rbac');

const MAX_BIGINT = 9223372036854775807n;
const RESTOCK_POLICIES = new Set(['restock', 'damaged', 'discarded']);
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

function normalizeTenders(body) {
  const rawList = Array.isArray(body?.tenders)
    ? body.tenders
    : body?.amountReceivedVnd !== undefined
      ? [{ method: body.method || 'cash', amountReceivedVnd: body.amountReceivedVnd }]
      : [];
  const seen = new Set();
  const tenders = rawList.map((entry) => {
    const method = entry?.method || 'cash';
    if (!METHODS.has(method)) throw new ApiError(400, 'validation_error', 'Phương thức thanh toán bù chưa hợp lệ.');
    if (seen.has(method)) throw new ApiError(400, 'validation_error', 'Mỗi phương thức thanh toán chỉ xuất hiện một lần.');
    seen.add(method);
    return { method, amountReceivedVnd: parseVnd(entry?.amountReceivedVnd, 'Số tiền thanh toán') };
  }).filter((t) => t.amountReceivedVnd > 0n);

  const totalReceivedVnd = tenders.reduce((sum, t) => sum + t.amountReceivedVnd, 0n);
  if (totalReceivedVnd > MAX_BIGINT) {
    throw new ApiError(400, 'validation_error', 'Tổng tiền thanh toán bù vượt giới hạn lưu trữ.');
  }
  return { tenders, totalReceivedVnd };
}

function normalizeExchange(body) {
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 2 || reason.length > 300) {
    throw new ApiError(400, 'validation_error', 'Nhập lý do đổi hàng từ 2 đến 300 ký tự.');
  }
  const restockPolicy = body?.restockPolicy || 'restock';
  if (!RESTOCK_POLICIES.has(restockPolicy)) {
    throw new ApiError(400, 'validation_error', 'Chính sách nhập lại hàng trả không hợp lệ.');
  }
  const restockWarehouseId = body?.restockWarehouseId || null;
  if (restockWarehouseId !== null && (typeof restockWarehouseId !== 'string' || !UUID_PATTERN.test(restockWarehouseId))) {
    throw new ApiError(400, 'validation_error', 'Kho nhận hàng trả không hợp lệ.');
  }
  const replacementWarehouseId = body?.replacementWarehouseId || null;
  if (replacementWarehouseId !== null && (typeof replacementWarehouseId !== 'string' || !UUID_PATTERN.test(replacementWarehouseId))) {
    throw new ApiError(400, 'validation_error', 'Kho xuất hàng đổi không hợp lệ.');
  }

  const rawReturns = Array.isArray(body?.returnItems) ? body.returnItems : [];
  if (!rawReturns.length || rawReturns.length > 50) {
    throw new ApiError(400, 'validation_error', 'Chọn từ 1 đến 50 dòng sản phẩm cần đổi trả.');
  }
  const seenLines = new Set();
  const returnItems = rawReturns.map((item) => {
    const orderLineId = typeof item?.orderLineId === 'string' ? item.orderLineId.toLowerCase() : '';
    if (!UUID_PATTERN.test(orderLineId)) throw new ApiError(400, 'validation_error', 'Dòng sản phẩm trả không hợp lệ.');
    if (seenLines.has(orderLineId)) throw new ApiError(400, 'validation_error', 'Mỗi dòng đơn hàng chỉ được chọn một lần khi đổi.');
    seenLines.add(orderLineId);
    return { orderLineId, quantityMilli: quantityMilli(item?.quantity) };
  });

  const rawReplacements = Array.isArray(body?.replacementItems) ? body.replacementItems : [];
  if (!rawReplacements.length || rawReplacements.length > 50) {
    throw new ApiError(400, 'validation_error', 'Chọn từ 1 đến 50 mặt hàng khách muốn đổi lấy.');
  }
  const replacementItems = rawReplacements.map((item) => {
    const productId = typeof item?.productId === 'string' ? item.productId.toLowerCase() : '';
    if (!UUID_PATTERN.test(productId)) throw new ApiError(400, 'validation_error', 'Mặt hàng đổi mới không hợp lệ.');
    return { productId, quantityMilli: quantityMilli(item?.quantity) };
  });

  const refundMethod = body?.refundMethod || 'cash';
  if (!METHODS.has(refundMethod)) throw new ApiError(400, 'validation_error', 'Phương thức hoàn tiền chênh lệch không hợp lệ.');
  const { tenders, totalReceivedVnd } = normalizeTenders(body);

  return {
    reason,
    restockPolicy,
    restockWarehouseId: restockWarehouseId ? restockWarehouseId.toLowerCase() : null,
    replacementWarehouseId: replacementWarehouseId ? replacementWarehouseId.toLowerCase() : null,
    returnItems,
    replacementItems,
    discountVnd: parseVnd(body?.discountVnd ?? 0, 'Giảm giá đơn đổi'),
    refundMethod,
    tenders,
    amountReceivedVnd: totalReceivedVnd,
    note: typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : '',
  };
}

function digestExchange(orderId, value) {
  return createHash('sha256')
    .update(JSON.stringify({ orderId, ...value }, (_k, entry) => (typeof entry === 'bigint' ? entry.toString() : entry)))
    .digest();
}

async function lockWarehousesSorted(client, storeId, warehouseIds) {
  const uniqueIds = [...new Set(warehouseIds.filter(Boolean))].sort();
  if (!uniqueIds.length) return new Map();
  const res = await client.query(
    `SELECT id, name, status FROM warehouses WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
    [storeId, uniqueIds]
  );
  const byId = new Map(res.rows.map((w) => [w.id, w]));
  for (const wid of uniqueIds) {
    const wh = byId.get(wid);
    if (!wh) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho phục vụ đổi hàng.');
    if (wh.status !== 'active') throw new ApiError(409, 'warehouse_inactive', `Kho "${wh.name}" đã ngừng hoạt động.`);
  }
  return byId;
}

async function loadOrderAndReturns(client, storeId, orderId, returnItems) {
  const orderRes = await client.query(
    `SELECT id, order_number, status, customer_id, warehouse_id, total_vnd::text AS total_vnd
     FROM orders WHERE store_id = $1 AND id = $2 FOR UPDATE`,
    [storeId, orderId]
  );
  if (!orderRes.rowCount || orderRes.rows[0].status === 'voided') {
    throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng có thể đổi.');
  }
  const order = orderRes.rows[0];
  if (order.status === 'returned') throw new ApiError(409, 'already_returned', 'Đơn hàng này đã được trả toàn bộ.');

  let customer = null;
  if (order.customer_id) {
    const custRes = await client.query(
      `SELECT id, status, credit_limit_vnd::text AS credit_limit_vnd
       FROM customers WHERE store_id = $1 AND id = $2 FOR UPDATE`,
      [storeId, order.customer_id]
    );
    customer = custRes.rows[0] || null;
  }

  const linesRes = await client.query(
    `SELECT ol.id, ol.product_id, ol.product_name_snapshot, ol.quantity::text AS quantity,
            ol.line_total_vnd::text AS line_total_vnd, p.inventory_tracked, p.serial_tracked,
            COALESCE((SELECT SUM(rl.quantity) FROM return_lines rl JOIN returns r ON r.id = rl.return_id
                      WHERE rl.store_id = ol.store_id AND rl.order_line_id = ol.id AND r.status = 'completed'), 0)::text AS returned_quantity,
            COALESCE((SELECT SUM(rl.refund_vnd) FROM return_lines rl JOIN returns r ON r.id = rl.return_id
                      WHERE rl.store_id = ol.store_id AND rl.order_line_id = ol.id AND r.status = 'completed'), 0)::text AS refunded_vnd
     FROM order_lines ol JOIN products p ON p.store_id = ol.store_id AND p.id = ol.product_id
     WHERE ol.store_id = $1 AND ol.order_id = $2 ORDER BY ol.product_id, ol.id FOR UPDATE OF ol`,
    [storeId, orderId]
  );
  const linesById = new Map(linesRes.rows.map((l) => [l.id, l]));
  const requestedReturnLines = returnItems.map((req) => {
    const line = linesById.get(req.orderLineId);
    if (!line) throw new ApiError(400, 'return_line_invalid', 'Một sản phẩm trả không thuộc đơn hàng đã chọn.');
    if (line.serial_tracked) throw new ApiError(409, 'serial_tracked_product', `${line.product_name_snapshot} quản lý theo từng mã riêng — hãy dùng Trả hàng rồi bán mới để khóa đúng mã.`);
    const remainingMilli = parseDbMilli(line.quantity) - parseDbMilli(line.returned_quantity);
    if (req.quantityMilli > remainingMilli) {
      throw new ApiError(409, 'return_quantity_exceeded', `${line.product_name_snapshot}: số lượng đổi trả vượt số lượng còn lại.`);
    }
    const remainingRefund = BigInt(line.line_total_vnd) - BigInt(line.refunded_vnd);
    const refundVnd = req.quantityMilli === remainingMilli
      ? remainingRefund
      : (remainingRefund * BigInt(req.quantityMilli) + BigInt(Math.floor(remainingMilli / 2))) / BigInt(remainingMilli);
    return { req, line, remainingMilli, refundVnd };
  }).sort((a, b) => a.line.product_id.localeCompare(b.line.product_id));

  const returnedTotalVnd = requestedReturnLines.reduce((sum, item) => sum + item.refundVnd, 0n);
  const previouslyReturnedVnd = linesRes.rows.reduce((sum, l) => sum + BigInt(l.refunded_vnd), 0n);
  const allLinesReturned = linesRes.rows.every((line) => {
    const added = requestedReturnLines.find((r) => r.line.id === line.id)?.req.quantityMilli || 0;
    return parseDbMilli(line.quantity) - parseDbMilli(line.returned_quantity) - added === 0;
  });

  const payRes = await client.query(
    `SELECT (
       COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = $1 AND p.order_id = $2 AND p.status = 'succeeded'), 0)
       - COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id
                   WHERE r.store_id = $1 AND r.order_id = $2 AND r.status = 'completed' AND f.status = 'succeeded'), 0)
     )::text AS net_paid_vnd`,
    [storeId, orderId]
  );

  return {
    order,
    customer,
    requestedReturnLines,
    returnedTotalVnd,
    origNetPaidVnd: BigInt(payRes.rows[0]?.net_paid_vnd || '0'),
    remainingOriginalValue: BigInt(order.total_vnd) - previouslyReturnedVnd - returnedTotalVnd,
    nextOrderStatus: allLinesReturned ? 'returned' : 'partially_returned',
  };
}

async function prepareReplacementProducts(client, storeId, replacementWarehouseId, replacementItems, discountVnd) {
  const productIds = [...new Set(replacementItems.map((i) => i.productId))].sort();
  const prodRes = await client.query(
    `SELECT id, sku, name, unit, sale_price_vnd::text AS sale_price_vnd, cost_vnd::text AS cost_vnd, inventory_tracked, serial_tracked, status
     FROM products WHERE store_id = $1 AND id = ANY($2::uuid[]) ORDER BY id FOR UPDATE`,
    [storeId, productIds]
  );
  const productMap = new Map(prodRes.rows.map((p) => [p.id, p]));
  if (productMap.size !== productIds.length || prodRes.rows.some((p) => p.status !== 'active')) {
    throw new ApiError(409, 'product_unavailable', 'Có sản phẩm đổi mới đã ngừng bán hoặc không thuộc cửa hàng.');
  }
  const serialReplacement = prodRes.rows.find((p) => p.serial_tracked);
  if (serialReplacement) {
    throw new ApiError(409, 'serial_tracked_product', `${serialReplacement.name} quản lý theo từng mã riêng — hãy bán mới tại quầy để quét đúng mã.`);
  }

  let subtotalVnd = 0n;
  const lines = replacementItems.map((item) => {
    const product = productMap.get(item.productId);
    const price = BigInt(product.sale_price_vnd);
    const grossVnd = (price * BigInt(item.quantityMilli) + 500n) / 1000n;
    subtotalVnd += grossVnd;
    if (grossVnd > MAX_BIGINT || subtotalVnd > MAX_BIGINT) {
      throw new ApiError(400, 'validation_error', 'Tổng tiền đơn hàng đổi vượt giới hạn lưu trữ.');
    }
    return { ...item, product, price, cost: BigInt(product.cost_vnd), grossVnd };
  });

  if (discountVnd > subtotalVnd) {
    throw new ApiError(400, 'validation_error', 'Giảm giá trên đơn đổi không được vượt tổng tiền hàng đổi mới.');
  }
  const replacementTotalVnd = subtotalVnd - discountVnd;

  return {
    warehouseId: replacementWarehouseId,
    lines,
    subtotalVnd,
    discountVnd,
    replacementTotalVnd,
    allocatedDiscount: distributeDiscount(lines, discountVnd, subtotalVnd || 1n),
    productIds,
    productMap,
  };
}

async function lockAndVerifyExchangeBalances(client, storeId, warehouseId, returnStage, replacementStage, restockPolicy, restockWarehouseId) {
  const allProducts = new Set();
  for (const item of replacementStage.lines) {
    if (item.product.inventory_tracked) allProducts.add(item.productId);
  }
  if (restockPolicy === 'restock') {
    for (const item of returnStage.requestedReturnLines) {
      if (item.line.inventory_tracked) allProducts.add(item.line.product_id);
    }
  }
  const sortedProductIds = [...allProducts].sort();
  const whIds = [...new Set([warehouseId, restockWarehouseId].filter(Boolean))].sort();

  const balMap = new Map();
  if (sortedProductIds.length && whIds.length) {
    const locked = await client.query(
      `SELECT warehouse_id, product_id, on_hand::text AS on_hand, reserved::text AS reserved
       FROM inventory_balances
       WHERE store_id = $1 AND warehouse_id = ANY($2::uuid[]) AND product_id = ANY($3::uuid[])
       ORDER BY warehouse_id, product_id FOR UPDATE`,
      [storeId, whIds, sortedProductIds]
    );
    for (const row of locked.rows) balMap.set(`${row.warehouse_id}|${row.product_id}`, row);
  }

  const restockSameWh = new Map();
  if (restockPolicy === 'restock' && restockWarehouseId === warehouseId) {
    for (const item of returnStage.requestedReturnLines) {
      if (item.line.inventory_tracked) {
        restockSameWh.set(item.line.product_id, (restockSameWh.get(item.line.product_id) || 0) + item.req.quantityMilli);
      }
    }
  }
  const neededByProduct = new Map();
  for (const item of replacementStage.lines) {
    if (item.product.inventory_tracked) {
      neededByProduct.set(item.productId, (neededByProduct.get(item.productId) || 0) + item.quantityMilli);
    }
  }
  for (const [productId, needed] of [...neededByProduct.entries()].sort()) {
    const bal = balMap.get(`${warehouseId}|${productId}`);
    const available = (bal ? parseDbMilli(bal.on_hand) - parseDbMilli(bal.reserved) : 0) + (restockSameWh.get(productId) || 0);
    if (needed > available) {
      throw new ApiError(409, 'insufficient_stock', `${replacementStage.productMap.get(productId).name} không đủ tồn kho để xuất đổi.`);
    }
  }
}

async function resolveExchangeSettlement(client, storeId, req, returnStage, replacementStage) {
  const { order, customer, returnedTotalVnd, origNetPaidVnd, remainingOriginalValue } = returnStage;
  const { replacementTotalVnd } = replacementStage;

  const cashSurplusAfterReturn = origNetPaidVnd > remainingOriginalValue ? origNetPaidVnd - remainingOriginalValue : 0n;
  const exchangeCreditFromCash = cashSurplusAfterReturn < replacementTotalVnd ? cashSurplusAfterReturn : replacementTotalVnd;

  let refundPaymentVnd = 0n;
  let extraPaidVnd = 0n;
  let cashReceivedVnd = 0n;
  let cashChangeVnd = 0n;
  let appliedTenders = [];
  let cashSessionId = null;
  const netDeltaVnd = replacementTotalVnd - returnedTotalVnd;

  if (netDeltaVnd >= 0n) {
    const collectDue = netDeltaVnd;
    const nonCash = req.tenders.filter((t) => t.method !== 'cash').reduce((s, t) => s + t.amountReceivedVnd, 0n);
    const cashTender = req.tenders.find((t) => t.method === 'cash');
    cashReceivedVnd = cashTender ? cashTender.amountReceivedVnd : 0n;
    if (nonCash > collectDue || (req.amountReceivedVnd > collectDue && cashReceivedVnd === 0n)) {
      throw new ApiError(400, 'validation_error', 'Chỉ tiền mặt được nhận dư để thối; thanh toán không tiền mặt không vượt số tiền bù.');
    }
    const cashApplied = cashReceivedVnd < (collectDue - nonCash) ? cashReceivedVnd : (collectDue - nonCash);
    extraPaidVnd = nonCash + cashApplied;
    cashChangeVnd = req.amountReceivedVnd - extraPaidVnd;
    appliedTenders = req.tenders
      .map((t) => ({ method: t.method, amountVnd: t.method === 'cash' ? cashApplied : t.amountReceivedVnd }))
      .filter((t) => t.amountVnd > 0n);

    if (extraPaidVnd < collectDue) {
      if (!order.customer_id) {
        throw new ApiError(400, 'customer_required', 'Cần đơn gắn khách hàng để ghi nợ phần tiền đổi chênh lệch còn thiếu.');
      }
      if (!customer || customer.status !== 'active') {
        throw new ApiError(409, 'customer_unavailable', 'Khách hàng đã lưu trữ nên không thể ghi tăng công nợ.');
      }
      if (customer.credit_limit_vnd !== null) {
        const balRes = await client.query(
          `SELECT COALESCE(SUM(debit_vnd - credit_vnd), 0)::text AS balance_vnd
           FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2`,
          [storeId, order.customer_id]
        );
        const currentBal = BigInt(balRes.rows[0].balance_vnd);
        if (currentBal + (collectDue - extraPaidVnd) > BigInt(customer.credit_limit_vnd)) {
          throw new ApiError(409, 'customer_credit_limit', 'Khoản chênh lệch đổi hàng vượt hạn mức công nợ của khách.');
        }
      }
    }
    if (cashReceivedVnd > 0n || cashChangeVnd > 0n) cashSessionId = await lockActiveCashSession(client, storeId);
  } else {
    const refundDue = -netDeltaVnd;
    const surplusLeftAfterNewOrder = cashSurplusAfterReturn > replacementTotalVnd ? cashSurplusAfterReturn - replacementTotalVnd : 0n;
    refundPaymentVnd = refundDue < surplusLeftAfterNewOrder ? refundDue : surplusLeftAfterNewOrder;
    if (refundDue - refundPaymentVnd > 0n && !order.customer_id) {
      throw new ApiError(409, 'customer_required', 'Đơn chưa gắn khách hàng nên không thể chuyển phần chênh lệch thành số dư khách.');
    }
    if (refundPaymentVnd > 0n && req.refundMethod === 'cash') {
      cashSessionId = await lockActiveCashSession(client, storeId, { cashOutVnd: refundPaymentVnd });
    }
  }

  return { netDeltaVnd, exchangeCreditFromCash, refundPaymentVnd, extraPaidVnd, cashReceivedVnd, cashChangeVnd, appliedTenders, cashSessionId };
}

async function applyReturnHalf(client, storeId, actorUserId, req, returnStage, restockWarehouse, replacementNumber) {
  const { order, requestedReturnLines, returnedTotalVnd, nextOrderStatus } = returnStage;
  const returnId = randomUUID();
  const retSeq = await client.query(
    `UPDATE store_sequences SET next_return_number = next_return_number + 1
     WHERE store_id = $1 RETURNING next_return_number - 1 AS num`,
    [storeId]
  );
  const returnNumber = `RT-${retSeq.rows[0].num}`;
  const fullReason = `${req.reason} (Đổi sang đơn ${replacementNumber})`.slice(0, 500);

  await client.query(
    `INSERT INTO returns (id, store_id, order_id, return_number, status, reason, refund_total_vnd, restock_policy, restock_warehouse_id, created_by)
     VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9)`,
    [returnId, storeId, order.id, returnNumber, fullReason, returnedTotalVnd.toString(), req.restockPolicy, restockWarehouse?.id || null, actorUserId]
  );

  for (const item of requestedReturnLines) {
    const restockQty = req.restockPolicy === 'restock' && item.line.inventory_tracked ? item.req.quantityMilli : 0;
    await client.query(
      `INSERT INTO return_lines (store_id, return_id, order_id, order_line_id, quantity, refund_vnd, restocked_quantity)
       VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::numeric)`,
      [storeId, returnId, order.id, item.line.id, quantityText(item.req.quantityMilli), item.refundVnd.toString(), quantityText(restockQty)]
    );
    if (!restockQty) continue;
    const bal = await client.query(
      `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand, reserved)
       VALUES ($1, $2, $3, $4::numeric, 0)
       ON CONFLICT (store_id, warehouse_id, product_id) DO UPDATE
         SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand,
             version = inventory_balances.version + 1, updated_at = now()
       RETURNING on_hand::text AS on_hand`,
      [storeId, restockWarehouse.id, item.line.product_id, quantityText(restockQty)]
    );
    await client.query(
      `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                         reason, source_type, source_id, actor_user_id)
       VALUES ($1, $2, $3, 'return', $4::numeric, $5::numeric, $6, 'return', $7, $8)`,
      [storeId, restockWarehouse.id, item.line.product_id, quantityText(restockQty), bal.rows[0].on_hand,
        `Nhập lại hàng đổi ${returnNumber} -> ${replacementNumber}`, returnId, actorUserId]
    );
  }
  await client.query('UPDATE orders SET status = $3, updated_at = now() WHERE store_id = $1 AND id = $2', [storeId, order.id, nextOrderStatus]);
  return { returnId, returnNumber };
}

async function createReplacementOrderHeader(client, storeId, actorUserId, req, returnStage, replacementStage, settlement, returnNumber, replacementNumber) {
  const { order } = returnStage;
  const { warehouseId, lines, subtotalVnd, discountVnd, replacementTotalVnd, allocatedDiscount } = replacementStage;
  const noteJoined = req.note
    ? `Đổi từ đơn ${order.order_number} (${returnNumber}) · ${req.note}`.slice(0, 500)
    : `Đổi từ đơn ${order.order_number} (${returnNumber}): ${req.reason}`.slice(0, 500);

  const ordRes = await client.query(
    `INSERT INTO orders (store_id, order_number, customer_id, cashier_id, warehouse_id, status, subtotal_vnd,
                         discount_vnd, tax_vnd, total_vnd, cash_received_vnd, cash_change_vnd, note)
     VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, 0, $8, $9, $10, $11)
     RETURNING id, order_number, occurred_at`,
    [storeId, replacementNumber, order.customer_id, actorUserId, warehouseId, subtotalVnd.toString(),
      discountVnd.toString(), replacementTotalVnd.toString(), settlement.cashReceivedVnd.toString(),
      settlement.cashChangeVnd.toString(), noteJoined]
  );
  const repOrder = ordRes.rows[0];

  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    await client.query(
      `INSERT INTO order_lines (store_id, order_id, product_id, product_name_snapshot, sku_snapshot,
                                unit_snapshot, quantity, unit_price_vnd, unit_cost_vnd, discount_vnd, line_total_vnd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [storeId, repOrder.id, l.product.id, l.product.name, l.product.sku, l.product.unit,
        quantityText(l.quantityMilli), l.price.toString(), l.cost.toString(), allocatedDiscount[i].toString(), (l.grossVnd - allocatedDiscount[i]).toString()]
    );
    if (!l.product.inventory_tracked) continue;
    const bal = await client.query(
      `UPDATE inventory_balances SET on_hand = on_hand - $3::numeric, version = version + 1, updated_at = now()
       WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $4
       RETURNING on_hand::text AS on_hand`,
      [storeId, warehouseId, quantityText(l.quantityMilli), l.product.id]
    );
    await client.query(
      `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                         reason, source_type, source_id, actor_user_id)
       VALUES ($1, $2, $3, 'sale', -$4::numeric, $5::numeric, $6, 'order', $7, $8)`,
      [storeId, warehouseId, l.product.id, quantityText(l.quantityMilli), bal.rows[0].on_hand,
        `Xuất đổi hàng ${replacementNumber} từ ${order.order_number}`, repOrder.id, actorUserId]
    );
  }
  return repOrder;
}

async function recordExchangeSettlementRows(client, storeId, actorUserId, req, returnStage, replacementStage, settlement, returnId, returnNumber, repOrder) {
  const { order, returnedTotalVnd } = returnStage;

  // Balance original order paid balance when cash surplus transfers into the replacement order
  if (settlement.exchangeCreditFromCash > 0n) {
    await client.query(
      `INSERT INTO refunds (store_id, return_id, method, status, amount_vnd, provider, recorded_by)
       VALUES ($1, $2, 'account_credit', 'succeeded', $3, 'exchange_credit', $4)`,
      [storeId, returnId, settlement.exchangeCreditFromCash.toString(), actorUserId]
    );
    await client.query(
      `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, provider, recorded_by)
       VALUES ($1, $2, 'other', 'succeeded', $3, 'exchange_credit', $4)`,
      [storeId, repOrder.id, settlement.exchangeCreditFromCash.toString(), actorUserId]
    );
  }
  for (const tender of settlement.appliedTenders) {
    await client.query(
      `INSERT INTO payments (store_id, order_id, method, status, amount_vnd, recorded_by)
       VALUES ($1, $2, $3, 'succeeded', $4, $5)`,
      [storeId, repOrder.id, tender.method, tender.amountVnd.toString(), actorUserId]
    );
  }
  for (const tender of req.tenders) {
    if (tender.amountReceivedVnd <= 0n) continue;
    await insertCashMovement(client, {
      storeId,
      direction: 'in',
      category: 'Đổi hàng - thu thêm',
      amountVnd: tender.amountReceivedVnd.toString(),
      method: tender.method,
      sourceType: 'order_payment',
      sourceId: repOrder.id,
      note: `Thu thêm đổi hàng ${repOrder.order_number}`,
      actorUserId,
      cashSessionId: tender.method === 'cash' ? settlement.cashSessionId : null,
      counterpartyKind: order.customer_id ? 'customer' : null,
      counterpartyId: order.customer_id || null,
    });
  }
  if (settlement.cashChangeVnd > 0n) {
    await insertCashMovement(client, {
      storeId,
      direction: 'out',
      category: 'Tiền thối',
      amountVnd: settlement.cashChangeVnd.toString(),
      method: 'cash',
      sourceType: 'order_change',
      sourceId: repOrder.id,
      note: `Thối tiền đổi hàng ${repOrder.order_number}`,
      actorUserId,
      cashSessionId: settlement.cashSessionId,
      counterpartyKind: order.customer_id ? 'customer' : null,
      counterpartyId: order.customer_id || null,
    });
  }
  if (settlement.refundPaymentVnd > 0n) {
    await client.query(
      `INSERT INTO refunds (store_id, return_id, method, status, amount_vnd, recorded_by)
       VALUES ($1, $2, $3, 'succeeded', $4, $5)`,
      [storeId, returnId, req.refundMethod, settlement.refundPaymentVnd.toString(), actorUserId]
    );
    await insertCashMovement(client, {
      storeId,
      direction: 'out',
      category: 'Đổi hàng - hoàn chênh lệch',
      amountVnd: settlement.refundPaymentVnd.toString(),
      method: req.refundMethod,
      sourceType: 'return_refund',
      sourceId: returnId,
      note: `Hoàn chênh lệch đổi hàng ${returnNumber}`,
      actorUserId,
      cashSessionId: settlement.cashSessionId,
      counterpartyKind: order.customer_id ? 'customer' : null,
      counterpartyId: order.customer_id || null,
    });
  }

  if (order.customer_id) {
    if (returnedTotalVnd > 0n) {
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'return_credit', $3, 'return', $4, $5, $6)`,
        [storeId, order.customer_id, returnedTotalVnd.toString(), returnId, `Trả đổi hàng ${returnNumber}`, actorUserId]
      );
    }
    if (replacementStage.replacementTotalVnd > 0n) {
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'sale_debit', $3, 'order', $4, $5, $6)`,
        [storeId, order.customer_id, replacementStage.replacementTotalVnd.toString(), repOrder.id, `Đơn đổi mới ${repOrder.order_number}`, actorUserId]
      );
    }
    if (settlement.extraPaidVnd > 0n) {
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6)`,
        [storeId, order.customer_id, settlement.extraPaidVnd.toString(), repOrder.id, `Thu thêm đổi hàng ${repOrder.order_number}`, actorUserId]
      );
    }
    if (settlement.refundPaymentVnd > 0n) {
      await client.query(
        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
         VALUES ($1, $2, 'manual_debit', $3, 'return_refund', $4, $5, $6)`,
        [storeId, order.customer_id, settlement.refundPaymentVnd.toString(), returnId, `Đã hoàn chênh lệch đổi hàng ${returnNumber}`, actorUserId]
      );
    }
  }
}

async function executeExchangeTransaction(client, storeId, actorUserId, orderId, req) {
  const returnStage = await loadOrderAndReturns(client, storeId, orderId, req.returnItems);
  const restockWhId = req.restockPolicy === 'restock' ? (req.restockWarehouseId || returnStage.order.warehouse_id) : null;
  const replacementWhId = req.replacementWarehouseId || returnStage.order.warehouse_id;
  await lockWarehousesSorted(client, storeId, [restockWhId, replacementWhId]);

  const replacementStage = await prepareReplacementProducts(client, storeId, replacementWhId, req.replacementItems, req.discountVnd);
  await lockAndVerifyExchangeBalances(client, storeId, replacementWhId, returnStage, replacementStage, req.restockPolicy, restockWhId);
  const settlement = await resolveExchangeSettlement(client, storeId, req, returnStage, replacementStage);

  const ordSeq = await client.query(
    `UPDATE store_sequences SET next_order_number = next_order_number + 1
     WHERE store_id = $1 RETURNING next_order_number - 1 AS num`,
    [storeId]
  );
  const replacementNumber = `SL-${ordSeq.rows[0].num}`;
  const { returnId, returnNumber } = await applyReturnHalf(
    client, storeId, actorUserId, req, returnStage, restockWhId ? { id: restockWhId } : null, replacementNumber
  );
  const repOrder = await createReplacementOrderHeader(
    client, storeId, actorUserId, req, returnStage, replacementStage, settlement, returnNumber, replacementNumber
  );
  await recordExchangeSettlementRows(client, storeId, actorUserId, req, returnStage, replacementStage, settlement, returnId, returnNumber, repOrder);

  await client.query(
    `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
     VALUES ($1, $2, 'order.exchanged', 'order', $3, $4, $5::jsonb)`,
    [storeId, actorUserId, orderId, req.reason, JSON.stringify({
      returnId,
      returnNumber,
      replacementOrderId: repOrder.id,
      replacementOrderNumber: repOrder.order_number,
      returnedTotalVnd: returnStage.returnedTotalVnd.toString(),
      replacementTotalVnd: replacementStage.replacementTotalVnd.toString(),
      netDeltaVnd: settlement.netDeltaVnd.toString(),
      extraPaidVnd: settlement.extraPaidVnd.toString(),
      refundPaymentVnd: settlement.refundPaymentVnd.toString(),
      exchangeCreditFromCash: settlement.exchangeCreditFromCash.toString(),
    })]
  );

  return {
    exchange: {
      originalOrderId: orderId,
      originalOrderStatus: returnStage.nextOrderStatus,
      returnId,
      returnNumber,
      replacementOrderId: repOrder.id,
      replacementOrderNumber: repOrder.order_number,
      returnedTotalVnd: returnStage.returnedTotalVnd.toString(),
      replacementTotalVnd: replacementStage.replacementTotalVnd.toString(),
      netDeltaVnd: settlement.netDeltaVnd.toString(),
      extraPaidVnd: settlement.extraPaidVnd.toString(),
      refundedVnd: settlement.refundPaymentVnd.toString(),
      exchangeCreditAppliedVnd: settlement.exchangeCreditFromCash.toString(),
      changeVnd: settlement.cashChangeVnd.toString(),
    },
  };
}

function registerExchangeRoutes(app, { pool, env }) {
  app.post('/api/stores/:storeId/orders/:orderId/exchange', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    }
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã chống gửi trùng. Hãy thử lại.');
    }

    const req = normalizeExchange(request.body || {});
    const reqHash = digestExchange(orderId, req);

    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'void_or_return_order', 'Tài khoản này không có quyền thực hiện đổi hàng.');
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
          throw new ApiError(409, 'idempotency_conflict', 'Mã đổi hàng đã được dùng cho nội dung khác.');
        }
        if (!rec.response_body || !rec.response_status) {
          throw new ApiError(409, 'request_in_progress', 'Giao dịch đổi hàng đang được xử lý.');
        }
        return { status: rec.response_status, body: rec.response_body, replayed: true };
      }

      const responseBody = await executeExchangeTransaction(client, storeId, auth.userId, orderId, req);
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

module.exports = { registerExchangeRoutes, normalizeExchange };
