'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { quantityMilli, quantityText } = require('./sales');
const { normalizeSerialCodeList } = require('./serials');
const { lockActiveCashSession } = require('./cash-register');
const { insertCashMovement } = require('./cashbook-ledger');
const { requirePermission } = require('./rbac');

const REFUND_METHODS = new Set(['cash', 'bank_transfer', 'bank_qr', 'card', 'other']);
const RESTOCK_POLICIES = new Set(['restock', 'damaged', 'discarded']);

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest();
}

function normalizeReturn(body) {
  if (!body || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw new ApiError(400, 'validation_error', 'Chọn ít nhất một sản phẩm trong đơn cần trả.');
  }
  const items = [];
  const seen = new Map();
  const seenSerials = new Set();
  for (const row of body.items) {
    if (!row || typeof row.orderLineId !== 'string' || !UUID_PATTERN.test(row.orderLineId)) {
      throw new ApiError(400, 'validation_error', 'Sản phẩm trả lại không hợp lệ.');
    }
    const milli = quantityMilli(row.quantity);
    let serialCodes = [];
    if (row.serialCodes !== undefined && row.serialCodes !== null) {
      if (!Array.isArray(row.serialCodes)) {
        throw new ApiError(400, 'validation_error', 'Danh sách mã riêng trả hàng không hợp lệ.');
      }
      serialCodes = normalizeSerialCodeList(row.serialCodes, { maxCount: 200 });
      if (serialCodes.length > 0 && (milli % 1000 !== 0 || serialCodes.length * 1000 !== milli)) {
        throw new ApiError(400, 'validation_error', 'Số lượng mã riêng trả lại phải khớp với số lượng sản phẩm trả.');
      }
      for (const code of serialCodes) {
        const key = code.toLocaleLowerCase('vi');
        if (seenSerials.has(key)) {
          throw new ApiError(400, 'duplicate_serial_code', `Mã riêng “${code}” bị trùng giữa các dòng trả hàng.`);
        }
        seenSerials.add(key);
      }
    }
    if (seen.has(row.orderLineId)) {
      const index = seen.get(row.orderLineId);
      items[index].quantityMilli += milli;
      if (!Number.isSafeInteger(items[index].quantityMilli)) throw new ApiError(400, 'validation_error', 'Số lượng trả vượt giới hạn.');
      if (serialCodes.length > 0 || items[index].serialCodes) {
        const merged = normalizeSerialCodeList([...(items[index].serialCodes || []), ...serialCodes], { maxCount: 200 });
        if (merged.length * 1000 !== items[index].quantityMilli) {
          throw new ApiError(400, 'validation_error', 'Số lượng mã riêng trả lại phải khớp với tổng số lượng trả của dòng.');
        }
        items[index].serialCodes = merged;
      }
    } else {
      seen.set(row.orderLineId, items.length);
      const entry = { orderLineId: row.orderLineId, quantityMilli: milli };
      if (serialCodes.length > 0) entry.serialCodes = serialCodes;
      items.push(entry);
    }
  }
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < 2 || reason.length > 500) throw new ApiError(400, 'validation_error', 'Lý do trả hàng cần từ 2 đến 500 ký tự.');
  const restockPolicy = body.restockPolicy || 'restock';
  if (!RESTOCK_POLICIES.has(restockPolicy)) throw new ApiError(400, 'validation_error', 'Cách xử lý hàng trả không hợp lệ.');
  const refundMethod = body.refundMethod || 'cash';
  if (!REFUND_METHODS.has(refundMethod)) throw new ApiError(400, 'validation_error', 'Phương thức hoàn tiền không hợp lệ.');
  let restockWarehouseId = null;
  if (body.restockWarehouseId != null && body.restockWarehouseId !== '') {
    if (typeof body.restockWarehouseId !== 'string' || !UUID_PATTERN.test(body.restockWarehouseId)) {
      throw new ApiError(400, 'validation_error', 'Kho nhận hàng hoàn không hợp lệ.');
    }
    restockWarehouseId = body.restockWarehouseId.toLowerCase();
  }
  if (restockPolicy !== 'restock') restockWarehouseId = null;
  return { items, reason, restockPolicy, refundMethod, restockWarehouseId: restockPolicy === 'restock' ? restockWarehouseId : null };
}

function registerReturnRoutes(app, { pool, env }) {
  app.post('/api/stores/:storeId/orders/:orderId/returns', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc đơn hàng không hợp lệ.');
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16 || idempotencyKey.length > 200) {
      throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
    }
    const value = normalizeReturn(request.body);
    const requestDigest = digest(value);
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'void_or_return_order', 'Tài khoản này không có quyền xử lý trả hàng.');
      const reserved = await client.query(
        `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
        [storeId, auth.userId, idempotencyKey, requestDigest]
      );
      if (!reserved.rowCount) {
        const previous = await client.query(
          `SELECT request_hash, response_status, response_body FROM idempotency_records
           WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
          [storeId, auth.userId, idempotencyKey]
        );
        const record = previous.rows[0];
        if (!record || !Buffer.from(record.request_hash).equals(requestDigest)) {
          throw new ApiError(409, 'idempotency_conflict', 'Mã lưu thao tác đã được dùng cho dữ liệu khác.');
        }
        if (!record.response_body || !record.response_status) throw new ApiError(409, 'request_in_progress', 'Yêu cầu đang được xử lý. Hãy thử lại sau.');
        return { status: record.response_status, body: record.response_body, replayed: true };
      }

      const linkedOrder = await client.query(
        'SELECT customer_id FROM orders WHERE store_id = $1 AND id = $2',
        [storeId, orderId]
      );
      if (!linkedOrder.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng có thể trả.');
      if (linkedOrder.rows[0].customer_id) {
        await client.query(
          'SELECT id FROM customers WHERE store_id = $1 AND id = $2 FOR UPDATE',
          [storeId, linkedOrder.rows[0].customer_id]
        );
      }
      const orderResult = await client.query(
        `SELECT id, order_number, customer_id, warehouse_id, status, total_vnd::text AS total_vnd FROM orders
         WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, orderId]
      );
      if (!orderResult.rowCount || orderResult.rows[0].status === 'voided') throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng có thể trả.');
      const order = orderResult.rows[0];
      if (order.status === 'returned') throw new ApiError(409, 'already_returned', 'Đơn hàng đã được trả toàn bộ.');

      let restockWarehouse = null;
      if (value.restockPolicy === 'restock') {
        const targetWarehouseId = value.restockWarehouseId || order.warehouse_id;
        const target = await client.query(
          `SELECT id, name, status FROM warehouses WHERE store_id = $1 AND id = $2 FOR UPDATE`,
          [storeId, targetWarehouseId]
        );
        if (!target.rowCount) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho nhận hàng hoàn.');
        if (target.rows[0].status !== 'active') throw new ApiError(409, 'warehouse_inactive', 'Kho nhận hàng hoàn đã lưu trữ. Hãy chọn một kho đang hoạt động.');
        restockWarehouse = target.rows[0];
      }

      const linesResult = await client.query(
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
      const linesById = new Map(linesResult.rows.map((line) => [line.id, line]));
      const requestedLines = value.items.map((requested) => {
        const line = linesById.get(requested.orderLineId);
        if (!line) throw new ApiError(400, 'return_line_invalid', 'Một sản phẩm không thuộc đơn hàng đã chọn.');
        const soldMilli = quantityMilli(Number(line.quantity));
        const returnedQuantity = Number(line.returned_quantity || 0);
        const returnedMilli = returnedQuantity ? quantityMilli(returnedQuantity) : 0;
        const remainingMilli = soldMilli - returnedMilli;
        if (requested.quantityMilli > remainingMilli) {
          throw new ApiError(409, 'return_quantity_exceeded', `${line.product_name_snapshot}: số lượng trả vượt số lượng còn được trả.`);
        }
        const gross = BigInt(line.line_total_vnd);
        const refunded = BigInt(line.refunded_vnd);
        const remainingRefund = gross - refunded;
        const refundVnd = requested.quantityMilli === remainingMilli
          ? remainingRefund
          : (remainingRefund * BigInt(requested.quantityMilli) + BigInt(Math.floor(remainingMilli / 2))) / BigInt(remainingMilli);
        return { requested, line, remainingMilli, refundVnd };
      }).sort((a, b) => a.line.product_id.localeCompare(b.line.product_id));
      const refundTotal = requestedLines.reduce((sum, item) => sum + item.refundVnd, 0n);
      for (const item of requestedLines) {
        if (item.requested.serialCodes?.length > 0) {
          const lowerCodes = item.requested.serialCodes.map((c) => c.toLocaleLowerCase('vi'));
          const matchedSerials = await client.query(
            `SELECT id, code FROM product_serial_codes
             WHERE store_id = $1 AND order_id = $2 AND product_id = $3 AND status = 'sold'
               AND lower(code) = ANY($4::text[])
             ORDER BY id FOR UPDATE`,
            [storeId, orderId, item.line.product_id, lowerCodes]
          );
          if (matchedSerials.rowCount !== item.requested.serialCodes.length) {
            throw new ApiError(409, 'serial_return_invalid', `${item.line.product_name_snapshot}: có mã riêng không thuộc đơn này hoặc đã được trả trước đó.`);
          }
          item.matchedSerialIds = matchedSerials.rows.map((r) => r.id);
        }
      }
      const refundableResult = await client.query(
        `SELECT (
           COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = $1 AND p.order_id = $2 AND p.status = 'succeeded'), 0)
           - COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id
                       WHERE r.store_id = $1 AND r.order_id = $2 AND r.status = 'completed' AND f.status = 'succeeded'), 0)
         )::text AS refundable_vnd`,
        [storeId, orderId]
      );
      const netPayments = BigInt(refundableResult.rows[0].refundable_vnd || '0');
      const previouslyReturnedValue = linesResult.rows.reduce(
        (sum, line) => sum + BigInt(line.refunded_vnd),
        0n
      );
      const remainingOrderValue = BigInt(order.total_vnd) - previouslyReturnedValue - refundTotal;
      const cashSurplus = netPayments > remainingOrderValue ? netPayments - remainingOrderValue : 0n;
      const refundPayment = refundTotal < cashSurplus ? refundTotal : cashSurplus;
      const customerCredit = refundTotal - refundPayment;
      if (customerCredit > 0n && !order.customer_id) {
        throw new ApiError(409, 'customer_required', 'Đơn này chưa gắn khách hàng. Không thể chuyển phần chưa thu thành số dư khách.');
      }
      const cashSessionId = refundPayment > 0n && value.refundMethod === 'cash'
        ? await lockActiveCashSession(client, storeId, { cashOutVnd: refundPayment })
        : null;

      const returnId = randomUUID();
      const sequence = await client.query(
        `UPDATE store_sequences SET next_return_number = next_return_number + 1
         WHERE store_id = $1 RETURNING next_return_number - 1 AS return_number`,
        [storeId]
      );
      if (!sequence.rowCount) throw new Error('Store return sequence is missing.');
      const returnNumber = `RT-${sequence.rows[0].return_number}`;
      await client.query(
        `INSERT INTO returns (id, store_id, order_id, return_number, status, reason, refund_total_vnd, restock_policy, restock_warehouse_id, created_by)
         VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9)`,
        [returnId, storeId, orderId, returnNumber, value.reason, refundTotal.toString(), value.restockPolicy, restockWarehouse?.id || null, auth.userId]
      );
      for (const item of requestedLines) {
        const restockedMilli = value.restockPolicy === 'restock' && item.line.inventory_tracked ? item.requested.quantityMilli : 0;
        await client.query(
          `INSERT INTO return_lines (store_id, return_id, order_id, order_line_id, quantity, refund_vnd, restocked_quantity)
           VALUES ($1, $2, $3, $4, $5::numeric, $6, $7::numeric)`,
          [storeId, returnId, orderId, item.line.id, quantityText(item.requested.quantityMilli), item.refundVnd.toString(), quantityText(restockedMilli)]
        );
        if (restockedMilli > 0) {
          const balance = await client.query(
            `INSERT INTO inventory_balances (store_id, warehouse_id, product_id, on_hand, reserved)
             VALUES ($1, $2, $3, $4::numeric, 0)
             ON CONFLICT (store_id, warehouse_id, product_id) DO UPDATE
               SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand,
                   version = inventory_balances.version + 1, updated_at = now()
             RETURNING on_hand::text AS on_hand`,
            [storeId, restockWarehouse.id, item.line.product_id, quantityText(restockedMilli)]
          );
          await client.query(
            `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after,
                                               reason, source_type, source_id, actor_user_id)
             VALUES ($1, $2, $3, 'return', $4::numeric, $5::numeric, $6, 'return', $7, $8)`,
            [storeId, restockWarehouse.id, item.line.product_id, quantityText(restockedMilli), balance.rows[0].on_hand,
              `Trả hàng ${returnNumber}`, returnId, auth.userId]
          );
          const wholeRestock = Math.floor(restockedMilli / 1000);
          if (item.matchedSerialIds?.length > 0) {
            await client.query(
              `UPDATE product_serial_codes
               SET status = 'in_stock', order_id = NULL, sold_at = NULL, warranty_expires_at = NULL, warehouse_id = $2, updated_at = now()
               WHERE store_id = $1 AND id = ANY($3::uuid[])`,
              [storeId, restockWarehouse.id, item.matchedSerialIds]
            );
          } else if (wholeRestock > 0) {
            await client.query(
              `UPDATE product_serial_codes
               SET status = 'in_stock', order_id = NULL, sold_at = NULL, warranty_expires_at = NULL, warehouse_id = $4, updated_at = now()
               WHERE id IN (
                 SELECT id FROM product_serial_codes
                 WHERE store_id = $1 AND order_id = $2 AND product_id = $3 AND status = 'sold'
                 ORDER BY sold_at DESC NULLS LAST, id DESC
                 LIMIT $5
               )`,
              [storeId, orderId, item.line.product_id, restockWarehouse.id, wholeRestock]
            );
          }
        } else if (item.matchedSerialIds?.length > 0) {
          await client.query(
            `UPDATE product_serial_codes
             SET status = 'archived', warranty_expires_at = NULL, updated_at = now()
             WHERE store_id = $1 AND id = ANY($2::uuid[])`,
            [storeId, item.matchedSerialIds]
          );
        } else if (item.line.serial_tracked) {
          const wholeRetire = Math.floor(item.requested.quantityMilli / 1000);
          if (wholeRetire > 0) {
            await client.query(
              `UPDATE product_serial_codes
               SET status = 'archived', warranty_expires_at = NULL, updated_at = now()
               WHERE id IN (
                 SELECT id FROM product_serial_codes
                 WHERE store_id = $1 AND order_id = $2 AND product_id = $3 AND status = 'sold'
                 ORDER BY sold_at DESC NULLS LAST, id DESC
                 LIMIT $4
               )`,
              [storeId, orderId, item.line.product_id, wholeRetire]
            );
          }
        }
      }
      if (refundPayment > 0n) {
        await client.query(
          `INSERT INTO refunds (store_id, return_id, method, status, amount_vnd, recorded_by)
           VALUES ($1, $2, $3, 'succeeded', $4, $5)`,
          [storeId, returnId, value.refundMethod, refundPayment.toString(), auth.userId]
        );
        await insertCashMovement(client, {
          storeId,
          direction: 'out',
          category: 'Hoàn tiền',
          amountVnd: refundPayment.toString(),
          method: value.refundMethod,
          sourceType: 'return_refund',
          sourceId: returnId,
          note: `Hoàn đơn ${order.order_number}`,
          actorUserId: auth.userId,
          cashSessionId,
          counterpartyKind: order.customer_id ? 'customer' : null,
          counterpartyId: order.customer_id || null,
        });
      }
      if (order.customer_id) {
        if (refundTotal > 0n) {
          await client.query(
            `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, 'return_credit', $3, 'return', $4, $5, $6)`,
            [storeId, order.customer_id, refundTotal.toString(), returnId, `Trả hàng ${returnNumber}`, auth.userId]
          );
        }
        if (refundPayment > 0n) {
          await client.query(
            `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, debit_vnd, source_type, source_id, note, actor_user_id)
             VALUES ($1, $2, 'manual_debit', $3, 'return_refund', $4, $5, $6)`,
            [storeId, order.customer_id, refundPayment.toString(), returnId, `Đã hoàn tiền ${returnNumber}`, auth.userId]
          );
        }
      }
      const totalRemaining = linesResult.rows.reduce((sum, line) => {
        const sold = quantityMilli(Number(line.quantity));
        const previousQuantity = Number(line.returned_quantity || 0);
        const previous = previousQuantity ? quantityMilli(previousQuantity) : 0;
        const added = requestedLines.find((item) => item.line.id === line.id)?.requested.quantityMilli || 0;
        return sum + sold - previous - added;
      }, 0);
      const nextStatus = totalRemaining === 0 ? 'returned' : 'partially_returned';
      await client.query('UPDATE orders SET status = $3, updated_at = now() WHERE store_id = $1 AND id = $2', [storeId, orderId, nextStatus]);
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1, $2, 'return.created', 'return', $3, $4,
                 jsonb_build_object('returnNumber', $5::text, 'refundVnd', $6::text,
                                    'restockWarehouseId', $7::text, 'restockWarehouseName', $8::text))`,
        [storeId, auth.userId, returnId, value.reason, returnNumber, refundTotal.toString(), restockWarehouse?.id || null, restockWarehouse?.name || null]
      );
      const body = {
        return: {
          id: returnId,
          number: returnNumber,
          orderId,
          status: 'completed',
          refundTotalVnd: refundTotal.toString(),
          refundedVnd: refundPayment.toString(),
          customerCreditVnd: customerCredit.toString(),
          restockPolicy: value.restockPolicy,
          restockWarehouseId: restockWarehouse?.id || null,
          restockWarehouseName: restockWarehouse?.name || null,
          orderStatus: nextStatus,
        },
      };
      await client.query(
        `UPDATE idempotency_records SET response_status = 201, response_body = $4::jsonb, completed_at = now()
         WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
        [storeId, auth.userId, idempotencyKey, JSON.stringify(body)]
      );
      return { status: 201, body, replayed: false };
    });
    if (outcome.replayed) reply.header('idempotent-replayed', 'true');
    return reply.code(outcome.status).send(outcome.body);
  });
}

module.exports = { registerReturnRoutes, normalizeReturn };
