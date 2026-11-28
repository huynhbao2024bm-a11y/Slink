'use strict';

const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { hasPermission, requirePermission } = require('./rbac');
const { allowedWarehouseIds, findAccessibleWarehouse } = require('./warehouse-access');

function toMilli(qtyText) {
  const match = /^(\d{1,11})(?:\.(\d{1,3}))?$/.exec(String(qtyText ?? '0').trim());
  if (!match) return 0n;
  return BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0'));
}

function milliToText(milli) {
  const safe = milli < 0n ? 0n : milli;
  const whole = safe / 1000n;
  const frac = String(safe % 1000n).padStart(3, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function normalizeExpiryDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ApiError(400, 'validation_error', 'Hạn sử dụng phải có định dạng YYYY-MM-DD.');
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, 'validation_error', 'Hạn sử dụng không hợp lệ.');
  }
  return text;
}

async function receiveBatchStock(client, {
  storeId,
  productId,
  warehouseId,
  batchCode,
  expiryDate = null,
  quantityText = '0',
  costVnd = null,
  note = '',
  actorUserId = null,
}) {
  const code = String(batchCode || '').trim();
  if (!code || code.length > 80) {
    throw new ApiError(400, 'validation_error', 'Mã lô hàng cần từ 1 đến 80 ký tự.');
  }
  const cleanExpiry = normalizeExpiryDate(expiryDate);
  const res = await client.query(
    `INSERT INTO product_batches (store_id, product_id, warehouse_id, batch_code, expiry_date, quantity, cost_vnd, note, created_by)
     VALUES ($1, $2, $3, $4, $5::date, $6::numeric, $7, $8, $9)
     ON CONFLICT (store_id, product_id, warehouse_id, lower(batch_code))
     DO UPDATE SET
       quantity = product_batches.quantity + EXCLUDED.quantity,
       expiry_date = COALESCE(EXCLUDED.expiry_date, product_batches.expiry_date),
       cost_vnd = COALESCE(EXCLUDED.cost_vnd, product_batches.cost_vnd),
       note = CASE WHEN EXCLUDED.note <> '' THEN EXCLUDED.note ELSE product_batches.note END,
       updated_at = now()
     RETURNING id, batch_code, expiry_date::text AS expiry_date, quantity::text AS quantity, cost_vnd::text AS cost_vnd, received_at`,
    [storeId, productId, warehouseId, code, cleanExpiry, quantityText, costVnd, String(note || '').trim().slice(0, 300), actorUserId]
  );
  return res.rows[0];
}

async function deductBatchesFefo(client, {
  storeId,
  productId,
  warehouseId,
  quantityMilli,
  preferredBatchId = null,
}) {
  let remaining = BigInt(quantityMilli);
  if (remaining <= 0n) return [];

  if (preferredBatchId) {
    if (!UUID_PATTERN.test(preferredBatchId)) {
      throw new ApiError(400, 'validation_error', 'Lô hàng được chọn không hợp lệ.');
    }
    const chosen = await client.query(
      `SELECT id, batch_code, quantity::text AS quantity
       FROM product_batches
       WHERE store_id = $1 AND id = $2 AND product_id = $3 AND warehouse_id = $4
       FOR UPDATE`,
      [storeId, preferredBatchId, productId, warehouseId]
    );
    if (!chosen.rowCount) {
      throw new ApiError(404, 'batch_not_found', 'Không tìm thấy lô hàng đã chọn trong kho xuất.');
    }
    const avail = toMilli(chosen.rows[0].quantity);
    if (avail < remaining) {
      throw new ApiError(409, 'insufficient_batch_stock', `Lô ${chosen.rows[0].batch_code} chỉ còn ${milliToText(avail)}, không đủ xuất ${milliToText(remaining)}.`);
    }
    const nextQty = milliToText(avail - remaining);
    await client.query(
      `UPDATE product_batches SET quantity = $2::numeric, updated_at = now() WHERE id = $1`,
      [chosen.rows[0].id, nextQty]
    );
    return [{ batchId: chosen.rows[0].id, batchCode: chosen.rows[0].batch_code, deducted: milliToText(remaining) }];
  }

  const rowsRes = await client.query(
    `SELECT id, batch_code, quantity::text AS quantity
     FROM product_batches
     WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $3 AND quantity > 0
     ORDER BY expiry_date ASC NULLS LAST, received_at ASC, id ASC
     FOR UPDATE`,
    [storeId, productId, warehouseId]
  );

  const deductions = [];
  for (const row of rowsRes.rows) {
    if (remaining <= 0n) break;
    const avail = toMilli(row.quantity);
    if (avail <= 0n) continue;
    const take = avail >= remaining ? remaining : avail;
    const nextQty = milliToText(avail - take);
    await client.query(
      `UPDATE product_batches SET quantity = $2::numeric, updated_at = now() WHERE id = $1`,
      [row.id, nextQty]
    );
    deductions.push({ batchId: row.id, batchCode: row.batch_code, deducted: milliToText(take) });
    remaining -= take;
  }
  return deductions;
}

function registerBatchRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/batches', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const productId = typeof request.query?.productId === 'string' && request.query.productId ? request.query.productId : null;
    const warehouseId = typeof request.query?.warehouseId === 'string' && request.query.warehouseId ? request.query.warehouseId : null;
    const includeEmpty = request.query?.includeEmpty === 'true';
    const expiringDaysRaw = request.query?.expiringDays;
    let expiringDays = null;
    if (expiringDaysRaw !== undefined && expiringDaysRaw !== '') {
      if (!/^\d{1,3}$/.test(String(expiringDaysRaw))) throw new ApiError(400, 'validation_error', 'Số ngày lọc hạn sử dụng không hợp lệ.');
      expiringDays = Number(expiringDaysRaw);
    }
    if (productId && !UUID_PATTERN.test(productId)) throw new ApiError(400, 'validation_error', 'Sản phẩm không hợp lệ.');
    if (warehouseId && !UUID_PATTERN.test(warehouseId)) throw new ApiError(400, 'validation_error', 'Kho không hợp lệ.');

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const canViewCost = hasPermission(membership, 'view_cost_price');
      if (warehouseId && !await findAccessibleWarehouse(client, storeId, membership, warehouseId)) {
        throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
      }
      const warehouseIds = allowedWarehouseIds(membership);
      const rowsRes = await client.query(
        `SELECT b.id, b.product_id, p.name AS product_name, p.sku, p.unit, p.image_version, p.image_content_type,
                b.warehouse_id, w.name AS warehouse_name, b.batch_code, b.expiry_date::text AS expiry_date,
                b.quantity::text AS quantity,
                CASE WHEN $1::boolean THEN b.cost_vnd::text ELSE NULL END AS cost_vnd,
                b.received_at, b.note,
                CASE
                  WHEN b.expiry_date IS NULL THEN NULL
                  ELSE (b.expiry_date - (now() AT TIME ZONE s.timezone)::date)::int
                END AS days_until_expiry
         FROM product_batches b
         JOIN products p ON p.store_id = b.store_id AND p.id = b.product_id
         JOIN warehouses w ON w.store_id = b.store_id AND w.id = b.warehouse_id
         JOIN stores s ON s.id = b.store_id
         WHERE b.store_id = $2
           AND ($3::uuid IS NULL OR b.product_id = $3)
           AND ($4::uuid IS NULL OR b.warehouse_id = $4)
           AND ($5::uuid[] IS NULL OR b.warehouse_id = ANY($5))
           AND ($6::boolean OR b.quantity > 0)
           AND ($7::int IS NULL OR (b.expiry_date IS NOT NULL AND b.expiry_date <= ((now() AT TIME ZONE s.timezone)::date + $7::int)))
         ORDER BY b.expiry_date ASC NULLS LAST, b.received_at ASC, b.id ASC
         LIMIT 300`,
        [canViewCost, storeId, productId, warehouseId, warehouseIds, includeEmpty, expiringDays]
      );

      const summaryRes = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date < (now() AT TIME ZONE s.timezone)::date)::int AS expired_count,
           COUNT(*) FILTER (WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date >= (now() AT TIME ZONE s.timezone)::date AND b.expiry_date <= (now() AT TIME ZONE s.timezone)::date + 7)::int AS expiring_7_count,
           COUNT(*) FILTER (WHERE b.quantity > 0 AND b.expiry_date IS NOT NULL AND b.expiry_date >= (now() AT TIME ZONE s.timezone)::date AND b.expiry_date <= (now() AT TIME ZONE s.timezone)::date + 30)::int AS expiring_30_count
         FROM product_batches b
         JOIN stores s ON s.id = b.store_id
         WHERE b.store_id = $1 AND ($2::uuid[] IS NULL OR b.warehouse_id = ANY($2))`,
        [storeId, warehouseIds]
      );

      return {
        batches: rowsRes.rows,
        summary: summaryRes.rows[0] || { expired_count: 0, expiring_7_count: 0, expiring_30_count: 0 },
      };
    });
  });

  app.post('/api/stores/:storeId/products/:productId/batches', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, productId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc sản phẩm không hợp lệ.');
    }
    const body = request.body || {};
    const warehouseId = typeof body.warehouseId === 'string' && body.warehouseId ? body.warehouseId : null;
    const batchCode = typeof body.batchCode === 'string' ? body.batchCode.trim() : '';
    const expiryDate = normalizeExpiryDate(body.expiryDate);
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const rawQty = body.quantity === undefined || body.quantity === null || body.quantity === '' ? '0' : String(body.quantity).trim();
    if (!/^(\d{1,11})(?:\.(\d{1,3}))?$/.test(rawQty)) {
      throw new ApiError(400, 'validation_error', 'Số lượng nhập lô không hợp lệ.');
    }
    const qtyMilli = toMilli(rawQty);
    let costVnd = null;
    if (body.costVnd !== undefined && body.costVnd !== null && body.costVnd !== '') {
      const c = Number(body.costVnd);
      if (!Number.isSafeInteger(c) || c < 0) throw new ApiError(400, 'validation_error', 'Giá vốn lô không hợp lệ.');
      costVnd = c;
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'edit_products', 'Tài khoản này không có quyền nhập lô hàng.');
      const targetWh = warehouseId
        ? await findAccessibleWarehouse(client, storeId, membership, warehouseId)
        : (await client.query(`SELECT id, name FROM warehouses WHERE store_id = $1 AND status = 'active' ORDER BY is_default DESC, created_at ASC LIMIT 1`, [storeId])).rows[0];
      if (!targetWh) throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');

      const prodRes = await client.query(
        `SELECT id, name, inventory_tracked, batch_tracked FROM products WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, productId]
      );
      if (!prodRes.rowCount) throw new ApiError(404, 'product_not_found', 'Không tìm thấy sản phẩm.');
      const product = prodRes.rows[0];
      if (!product.batch_tracked) {
        await client.query(`UPDATE products SET batch_tracked = true, updated_at = now() WHERE id = $1`, [productId]);
      }

      const finalCode = batchCode || `LO-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`;
      const batch = await receiveBatchStock(client, {
        storeId,
        productId,
        warehouseId: targetWh.id,
        batchCode: finalCode,
        expiryDate,
        quantityText: rawQty,
        costVnd,
        note,
        actorUserId: auth.userId,
      });

      if (qtyMilli > 0n && product.inventory_tracked) {
        await client.query(
          `INSERT INTO inventory_balances (store_id, product_id, warehouse_id, on_hand, reserved)
           VALUES ($1, $2, $3, $4::numeric, 0)
           ON CONFLICT (store_id, product_id, warehouse_id)
           DO UPDATE SET on_hand = inventory_balances.on_hand + EXCLUDED.on_hand, version = inventory_balances.version + 1, updated_at = now()`,
          [storeId, productId, targetWh.id, rawQty]
        );
        const balRes = await client.query(
          `SELECT on_hand::text AS on_hand FROM inventory_balances WHERE store_id = $1 AND product_id = $2 AND warehouse_id = $3`,
          [storeId, productId, targetWh.id]
        );
        await client.query(
          `INSERT INTO inventory_movements (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after, reason, source_type, source_id, actor_user_id)
           VALUES ($1, $2, $3, 'adjustment', $4::numeric, $5::numeric, $6, 'batch', $7, $8)`,
          [storeId, targetWh.id, productId, rawQty, balRes.rows[0]?.on_hand || rawQty, `Nhập lô ${finalCode}${expiryDate ? ` (HSD ${expiryDate})` : ''}`, batch.id, auth.userId]
        );
      }

      return { batch };
    });
  });

  app.delete('/api/stores/:storeId/batches/:batchId', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, batchId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(batchId)) {
      throw new ApiError(400, 'validation_error', 'Yêu cầu không hợp lệ.');
    }
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'edit_products', 'Tài khoản này không có quyền xóa lô hàng.');
      const res = await client.query(
        `DELETE FROM product_batches WHERE store_id = $1 AND id = $2 AND quantity = 0 RETURNING id`,
        [storeId, batchId]
      );
      if (!res.rowCount) {
        throw new ApiError(409, 'batch_not_empty', 'Chỉ có thể xóa lô hàng đã hết tồn (SL = 0).');
      }
      return { deleted: true };
    });
  });
}

module.exports = { registerBatchRoutes, deductBatchesFefo, receiveBatchStock };
