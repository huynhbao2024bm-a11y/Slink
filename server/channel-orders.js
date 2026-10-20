'use strict';

const { createHash, randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { allowedWarehouseIds, canAccessWarehouse } = require('./warehouse-access');

const ORDER_ROLES = new Set(['owner', 'manager', 'stockkeeper']);
const PAYMENT_SNAPSHOTS = new Set(['unpaid', 'paid', 'cod', 'unknown']);
const ORDER_STATUSES = new Set(['reserved', 'packed', 'shipped', 'delivered', 'cancelled']);
const MAX_LINES = 100;
const MAX_VND = 9223372036854775807n;

function requireOrderRole(role) {
  if (!ORDER_ROLES.has(role)) throw new ApiError(403, 'forbidden', 'Vai trò của bạn không được quản lý đơn hàng kênh bán.');
}

function requireKey(request) {
  const key = request.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 16 || key.length > 200) {
    throw new ApiError(400, 'idempotency_key_required', 'Thiếu mã lưu thao tác an toàn. Hãy thử lại.');
  }
  return key;
}

function text(value, label, max, { optional = false } = {}) {
  const normalized = typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if ((!optional && !normalized) || normalized.length > max) {
    throw new ApiError(400, 'validation_error', optional ? `${label} không được dài quá ${max} ký tự.` : `${label} cần từ 1 đến ${max} ký tự.`);
  }
  return normalized;
}

function quantityMilli(value) {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  const match = /^(0|[1-9]\d{0,9})(?:\.(\d{1,3}))?$/.exec(String(raw ?? ''));
  if (!match) throw new ApiError(400, 'validation_error', 'Số lượng cần là số dương, tối đa 3 chữ số thập phân.');
  const milli = BigInt(match[1]) * 1000n + BigInt((match[2] || '').padEnd(3, '0') || '0');
  if (milli <= 0n) throw new ApiError(400, 'validation_error', 'Số lượng cần lớn hơn 0.');
  return milli;
}

function quantityString(milli) {
  const whole = milli / 1000n;
  const fraction = milli % 1000n;
  return fraction ? `${whole}.${String(fraction).padStart(3, '0').replace(/0+$/, '')}` : String(whole);
}

function integerVnd(value, label) {
  const raw = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if (typeof raw !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(raw)) {
    throw new ApiError(400, 'validation_error', `${label} phải là VND nguyên không âm, không dùng dấu phân cách.`);
  }
  const amount = BigInt(raw);
  if (amount > MAX_VND) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return amount;
}

function parseLines(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_LINES) {
    throw new ApiError(400, 'validation_error', `Đơn cần từ 1 đến ${MAX_LINES} dòng hàng.`);
  }
  const seen = new Set();
  let total = 0n;
  const items = raw.map((item) => {
    if (typeof item?.mappingId !== 'string' || !UUID_PATTERN.test(item.mappingId)) {
      throw new ApiError(400, 'validation_error', 'Một dòng hàng chưa chọn ánh xạ SKU hợp lệ.');
    }
    const mappingId = item.mappingId.toLowerCase();
    if (seen.has(mappingId)) throw new ApiError(400, 'validation_error', 'Mỗi SKU trên kênh chỉ được xuất hiện một lần trong đơn.');
    seen.add(mappingId);
    const milli = quantityMilli(item.quantity);
    const unitPrice = integerVnd(item.unitPriceVnd, 'Đơn giá');
    const lineTotal = (unitPrice * milli + 500n) / 1000n;
    total += lineTotal;
    if (lineTotal > MAX_VND || total > MAX_VND) throw new ApiError(400, 'validation_error', 'Tổng tiền đơn vượt giới hạn lưu trữ.');
    return { mappingId, milli, quantity: quantityString(milli), unitPrice: unitPrice.toString(), lineTotal: lineTotal.toString() };
  });
  return { items, total: total.toString() };
}

function parseVersion(value) {
  if (typeof value !== 'string' || !/^\d{1,9}$/.test(value)) throw new ApiError(400, 'validation_error', 'Phiên bản đơn hàng không hợp lệ. Tải lại dữ liệu rồi thử lại.');
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) throw new ApiError(400, 'validation_error', 'Phiên bản đơn hàng không hợp lệ. Tải lại dữ liệu rồi thử lại.');
  return version;
}

function asMilli(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
}

async function reserveIdempotency(client, storeId, actorId, key, payload) {
  const digest = createHash('sha256').update(JSON.stringify(payload)).digest();
  const inserted = await client.query(
    `INSERT INTO idempotency_records (store_id, actor_user_id, idempotency_key, request_hash)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING idempotency_key`,
    [storeId, actorId, key, digest]
  );
  if (inserted.rowCount) return { digest, replay: null };
  const prior = await client.query(
    `SELECT request_hash, response_status, response_body FROM idempotency_records
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3 FOR UPDATE`,
    [storeId, actorId, key]
  );
  const record = prior.rows[0];
  if (!record || !Buffer.from(record.request_hash).equals(digest)) throw new ApiError(409, 'idempotency_conflict', 'Mã thao tác đã được dùng cho nội dung khác.');
  if (!record.response_status || !record.response_body) throw new ApiError(409, 'request_in_progress', 'Đơn đang được xử lý. Hãy tải lại dữ liệu sau.');
  return { digest, replay: { status: record.response_status, body: record.response_body, replayed: true } };
}

async function saveIdempotentResponse(client, storeId, actorId, key, status, body) {
  await client.query(
    `UPDATE idempotency_records SET response_status = $4, response_body = $5::jsonb, completed_at = now()
     WHERE store_id = $1 AND actor_user_id = $2 AND idempotency_key = $3`,
    [storeId, actorId, key, status, JSON.stringify(body)]
  );
}

function finish(reply, outcome) {
  if (outcome.replayed) reply.header('idempotent-replayed', 'true');
  return reply.code(outcome.status).send(outcome.body);
}

function publicOrder(row) {
  return {
    id: row.id,
    channelProfileId: row.channel_profile_id,
    channelCode: row.channel_code,
    shopLabel: row.shop_label,
    externalOrderRef: row.external_order_ref,
    fulfillmentWarehouseId: row.fulfillment_warehouse_id,
    warehouseName: row.warehouse_name,
    fulfillmentStatus: row.fulfillment_status,
    paymentStatusSnapshot: row.payment_status_snapshot,
    totalVnd: String(row.total_vnd),
    customerName: row.customer_name_snapshot,
    internalNote: row.internal_note,
    lineCount: Number(row.line_count || 0),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    packedAt: row.packed_at,
    shippedAt: row.shipped_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  };
}

function registerChannelOrderRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/channel-order-catalog', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    const profileId = request.query?.profileId;
    if (!UUID_PATTERN.test(storeId) || typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc gian hàng không hợp lệ.');
    const query = typeof request.query?.q === 'string' ? request.query.q.normalize('NFKC').trim().slice(0, 100) : '';
    const rawLimit = request.query?.limit === undefined ? '100' : request.query.limit;
    const rawOffset = request.query?.offset === undefined ? '0' : request.query.offset;
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100
      || typeof rawOffset !== 'string' || !/^\d+$/.test(rawOffset) || Number(rawOffset) > 10000) {
      throw new ApiError(400, 'validation_error', 'Trang mã hàng không hợp lệ.');
    }
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireOrderRole(membership.role);
      const result = await client.query(
        `SELECT m.id AS mapping_id, m.external_sku, m.external_product_ref,
                p.id AS product_id, p.sku, p.name, p.unit, p.sale_price_vnd::text AS sale_price_vnd,
                p.inventory_tracked
         FROM channel_product_mappings m
         JOIN sales_channel_profiles cp ON cp.store_id = m.store_id AND cp.id = m.channel_profile_id
         JOIN products p ON p.store_id = m.store_id AND p.id = m.product_id
         WHERE m.store_id = $1 AND m.channel_profile_id = $2 AND m.status = 'active'
           AND cp.status = 'active' AND p.status = 'active' AND p.inventory_tracked
           AND ($3 = '' OR p.name ILIKE '%' || $3 || '%' OR p.sku ILIKE '%' || $3 || '%' OR m.external_sku ILIKE '%' || $3 || '%')
         ORDER BY p.name, p.sku, m.id LIMIT $4 OFFSET $5`,
        [storeId, profileId, query, limit + 1, offset]
      );
      const hasMore = result.rows.length > limit;
      const mappings = result.rows.slice(0, limit).map((row) => ({
        mappingId: row.mapping_id, productId: row.product_id, externalSku: row.external_sku,
        sku: row.sku, productName: row.name, unit: row.unit, suggestedUnitPriceVnd: String(row.sale_price_vnd),
      }));
      return { mappings, nextOffset: hasMore ? offset + limit : null };
    });
  });

  app.get('/api/stores/:storeId/channel-orders', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const rawLimit = request.query?.limit === undefined ? '50' : request.query.limit;
    const rawOffset = request.query?.offset === undefined ? '0' : request.query.offset;
    if (typeof rawLimit !== 'string' || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 100
      || typeof rawOffset !== 'string' || !/^\d+$/.test(rawOffset) || Number(rawOffset) > 10000) {
      throw new ApiError(400, 'validation_error', 'Trang đơn kênh bán không hợp lệ.');
    }
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    const query = typeof request.query?.q === 'string' ? request.query.q.normalize('NFKC').trim().slice(0, 120) : '';
    const rawStatus = request.query?.status;
    if (rawStatus !== undefined && (typeof rawStatus !== 'string' || (rawStatus !== '' && !ORDER_STATUSES.has(rawStatus)))) {
      throw new ApiError(400, 'validation_error', 'Trạng thái lọc đơn kênh bán không hợp lệ.');
    }
    const status = rawStatus || '';
    const rawProfileId = request.query?.profileId;
    if (rawProfileId !== undefined && (typeof rawProfileId !== 'string' || !UUID_PATTERN.test(rawProfileId))) {
      throw new ApiError(400, 'validation_error', 'Gian hàng lọc đơn kênh bán không hợp lệ.');
    }
    const profileId = rawProfileId || '';
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireOrderRole(membership.role);
      const warehouseIds = allowedWarehouseIds(membership);
      const result = await client.query(
        `SELECT o.id, o.channel_profile_id, cp.channel_code, cp.shop_label, o.external_order_ref,
                o.fulfillment_warehouse_id, w.name AS warehouse_name, o.fulfillment_status,
                o.payment_status_snapshot, o.total_vnd, o.customer_name_snapshot, o.internal_note,
                o.version, o.created_at, o.updated_at, o.packed_at, o.shipped_at, o.delivered_at, o.cancelled_at,
                COUNT(l.id)::int AS line_count
         FROM channel_orders o
         JOIN sales_channel_profiles cp ON cp.store_id = o.store_id AND cp.id = o.channel_profile_id
         JOIN warehouses w ON w.store_id = o.store_id AND w.id = o.fulfillment_warehouse_id
         LEFT JOIN channel_order_lines l ON l.store_id = o.store_id AND l.order_id = o.id
         WHERE o.store_id = $1
           AND ($2 = '' OR o.fulfillment_status = $2)
           AND ($3 = '' OR o.channel_profile_id::text = $3)
           AND ($4 = '' OR o.external_order_ref ILIKE '%' || $4 || '%' OR o.customer_name_snapshot ILIKE '%' || $4 || '%')
           AND ($5::boolean = false OR o.fulfillment_warehouse_id = ANY($6::uuid[]))
         GROUP BY o.id, cp.channel_code, cp.shop_label, w.name
         ORDER BY o.created_at DESC, o.id DESC LIMIT $7 OFFSET $8`,
        [storeId, status, profileId, query, warehouseIds !== null, warehouseIds || [], limit + 1, offset]
      );
      const hasMore = result.rows.length > limit;
      const total = await client.query(
        `SELECT COUNT(*)::int AS total FROM channel_orders o
         WHERE o.store_id = $1 AND ($2 = '' OR o.fulfillment_status = $2)
           AND ($3 = '' OR o.channel_profile_id::text = $3)
           AND ($4 = '' OR o.external_order_ref ILIKE '%' || $4 || '%' OR o.customer_name_snapshot ILIKE '%' || $4 || '%')
           AND ($5::boolean = false OR o.fulfillment_warehouse_id = ANY($6::uuid[]))`,
        [storeId, status, profileId, query, warehouseIds !== null, warehouseIds || []]
      );
      return {
        orders: result.rows.slice(0, limit).map(publicOrder),
        total: total.rows[0].total,
        nextOffset: hasMore ? offset + limit : null,
      };
    });
  });

  app.get('/api/stores/:storeId/channel-orders/:orderId', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Đơn hàng kênh bán không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireOrderRole(membership.role);
      const header = await client.query(
        `SELECT o.id, o.channel_profile_id, cp.channel_code, cp.shop_label, o.external_order_ref,
                o.fulfillment_warehouse_id, w.name AS warehouse_name, o.fulfillment_status,
                o.payment_status_snapshot, o.total_vnd, o.customer_name_snapshot, o.internal_note,
                o.version, o.created_at, o.updated_at, o.packed_at, o.shipped_at, o.delivered_at, o.cancelled_at
         FROM channel_orders o JOIN sales_channel_profiles cp ON cp.store_id = o.store_id AND cp.id = o.channel_profile_id
         JOIN warehouses w ON w.store_id = o.store_id AND w.id = o.fulfillment_warehouse_id
         WHERE o.store_id = $1 AND o.id = $2`, [storeId, orderId]
      );
      if (!header.rowCount) throw new ApiError(404, 'channel_order_not_found', 'Không tìm thấy đơn hàng kênh bán.');
      if (!canAccessWarehouse(membership, header.rows[0].fulfillment_warehouse_id)) throw new ApiError(404, 'channel_order_not_found', 'Không tìm thấy đơn hàng kênh bán.');
      const [lines, events] = await Promise.all([
        client.query(
          `SELECT id, line_number, external_sku_snapshot, product_id, product_name_snapshot, internal_sku_snapshot,
                  unit_snapshot, quantity::text AS quantity, unit_price_vnd::text AS unit_price_vnd, line_total_vnd::text AS line_total_vnd
           FROM channel_order_lines WHERE store_id = $1 AND order_id = $2 ORDER BY line_number`, [storeId, orderId]
        ),
        client.query(
          `SELECT e.id, e.event_type, e.from_status, e.to_status, e.reason, e.occurred_at, u.display_name AS actor_name
           FROM channel_order_events e JOIN users u ON u.id = e.actor_user_id
           WHERE e.store_id = $1 AND e.order_id = $2 ORDER BY e.occurred_at, e.id`, [storeId, orderId]
        ),
      ]);
      return {
        order: publicOrder({ ...header.rows[0], line_count: lines.rowCount }),
        lines: lines.rows.map((row) => ({
          id: row.id, lineNumber: row.line_number, externalSku: row.external_sku_snapshot, productId: row.product_id,
          productName: row.product_name_snapshot, sku: row.internal_sku_snapshot, unit: row.unit_snapshot,
          quantity: row.quantity, unitPriceVnd: row.unit_price_vnd, lineTotalVnd: row.line_total_vnd,
        })),
        events: events.rows.map((event) => ({
          id: event.id, type: event.event_type, fromStatus: event.from_status, toStatus: event.to_status,
          reason: event.reason, occurredAt: event.occurred_at, actorName: event.actor_name,
        })),
      };
    });
  });

  app.post('/api/stores/:storeId/channel-orders', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const profileId = request.body?.channelProfileId;
    const warehouseId = request.body?.warehouseId;
    if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId) || typeof warehouseId !== 'string' || !UUID_PATTERN.test(warehouseId)) {
      throw new ApiError(400, 'validation_error', 'Hãy chọn gian hàng và kho giao đúng.');
    }
    const externalOrderRef = text(request.body?.externalOrderRef, 'Mã đơn trên kênh', 120);
    const externalOrderRefNormalized = externalOrderRef.normalize('NFKC').toLocaleLowerCase('en-US');
    const paymentStatus = request.body?.paymentStatusSnapshot ?? 'unknown';
    if (typeof paymentStatus !== 'string' || !PAYMENT_SNAPSHOTS.has(paymentStatus)) throw new ApiError(400, 'validation_error', 'Trạng thái thanh toán của kênh chưa hợp lệ.');
    const customerName = text(request.body?.customerName || '', 'Tên người nhận', 160, { optional: true });
    const internalNote = text(request.body?.internalNote || '', 'Ghi chú nội bộ', 500, { optional: true });
    const { items, total } = parseLines(request.body?.items);
    const key = requireKey(request);
    const canonical = {
      operation: 'channel_order_create', channelProfileId: profileId.toLowerCase(), warehouseId: warehouseId.toLowerCase(),
      externalOrderRef, externalOrderRefNormalized, paymentStatus, customerName, internalNote,
      items: items.map((item) => ({ mappingId: item.mappingId, quantity: item.quantity, unitPriceVnd: item.unitPrice })),
    };
    let outcome;
    try {
      outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        requireOrderRole(membership.role);
        const reservation = await reserveIdempotency(client, storeId, auth.userId, key, canonical);
        if (reservation.replay) return reservation.replay;
        const warehouseIds = allowedWarehouseIds(membership);
        const warehouse = await client.query(
          `SELECT id, name, status FROM warehouses WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, warehouseId]
        );
        if (!warehouse.rowCount || warehouse.rows[0].status !== 'active' || !canAccessWarehouse(membership, warehouseId)
          || (warehouseIds !== null && !warehouseIds.includes(warehouseId))) {
          throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động được giao cho bạn.');
        }
        const profile = await client.query(
          `SELECT id, channel_code, shop_label FROM sales_channel_profiles
           WHERE store_id = $1 AND id = $2 AND status = 'active' FOR UPDATE`, [storeId, profileId]
        );
        if (!profile.rowCount) throw new ApiError(404, 'channel_profile_not_found', 'Không tìm thấy gian hàng đang hoạt động.');
        const mappingIds = items.map((item) => item.mappingId).sort();
        const mappings = await client.query(
          `SELECT m.id AS mapping_id, m.external_sku, m.channel_profile_id, p.id AS product_id,
                  p.sku, p.name, p.unit, p.status AS product_status, p.inventory_tracked
           FROM channel_product_mappings m JOIN products p ON p.store_id = m.store_id AND p.id = m.product_id
           WHERE m.store_id = $1 AND m.channel_profile_id = $2 AND m.id = ANY($3::uuid[])
             AND m.status = 'active'
           ORDER BY p.id FOR UPDATE OF m, p`, [storeId, profileId, mappingIds]
        );
        const mappingById = new Map(mappings.rows.map((row) => [row.mapping_id, row]));
        if (mappingById.size !== mappingIds.length || mappings.rows.some((row) => row.product_status !== 'active' || !row.inventory_tracked)) {
          throw new ApiError(409, 'channel_mapping_unavailable', 'Một SKU không còn ánh xạ tới sản phẩm đang hoạt động có theo dõi tồn kho.');
        }
        const productIds = [...new Set(mappings.rows.map((row) => row.product_id))].sort();
        if (productIds.length !== items.length) throw new ApiError(400, 'validation_error', 'Mỗi sản phẩm chỉ được xuất hiện một lần trong đơn.');
        const balances = await client.query(
          `SELECT product_id, on_hand::text AS on_hand, reserved::text AS reserved FROM inventory_balances
           WHERE store_id = $1 AND warehouse_id = $2 AND product_id = ANY($3::uuid[]) ORDER BY product_id FOR UPDATE`,
          [storeId, warehouseId, productIds]
        );
        const balanceByProduct = new Map(balances.rows.map((row) => [row.product_id, row]));
        if (balanceByProduct.size !== productIds.length) throw new ApiError(409, 'insufficient_channel_stock', 'Kho giao chưa có số tồn cho một hoặc nhiều SKU. Đơn chưa được tạo.');
        for (const item of items) {
          const mapping = mappingById.get(item.mappingId);
          const balance = balanceByProduct.get(mapping.product_id);
          if (item.milli > asMilli(balance.on_hand) - asMilli(balance.reserved)) {
            throw new ApiError(409, 'insufficient_channel_stock', `Kho giao không đủ tồn khả dụng cho ${mapping.sku}. Đơn chưa được tạo.`);
          }
        }
        const id = randomUUID();
        const created = await client.query(
          `INSERT INTO channel_orders
             (id, store_id, channel_profile_id, fulfillment_warehouse_id, external_order_ref,
              external_order_ref_normalized, fulfillment_status, payment_status_snapshot, total_vnd,
              customer_name_snapshot, internal_note, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,'reserved',$7,$8,$9,$10,$11,$11)
           RETURNING id, channel_profile_id, fulfillment_warehouse_id, external_order_ref, fulfillment_status,
                     payment_status_snapshot, total_vnd, customer_name_snapshot, internal_note,
                     version, created_at, updated_at, packed_at, shipped_at, delivered_at, cancelled_at`,
          [id, storeId, profileId, warehouseId, externalOrderRef, externalOrderRefNormalized, paymentStatus, total, customerName, internalNote, auth.userId]
        );
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const mapping = mappingById.get(item.mappingId);
          const balance = balanceByProduct.get(mapping.product_id);
          await client.query(
            `INSERT INTO channel_order_lines
               (store_id, order_id, channel_profile_id, line_number, channel_mapping_id, product_id,
                external_sku_snapshot, product_name_snapshot, internal_sku_snapshot, unit_snapshot,
                quantity, unit_price_vnd, line_total_vnd)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::numeric,$12,$13)`,
            [storeId, id, profileId, index + 1, mapping.mapping_id, mapping.product_id, mapping.external_sku,
              mapping.name, mapping.sku, mapping.unit, item.quantity, item.unitPrice, item.lineTotal]
          );
          await client.query(
            `UPDATE inventory_balances SET reserved = reserved + $4::numeric, version = version + 1, updated_at = now()
             WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3`,
            [storeId, warehouseId, mapping.product_id, item.quantity]
          );
          balanceByProduct.set(mapping.product_id, { ...balance, reserved: String(Number(balance.reserved) + Number(item.quantity)) });
        }
        await client.query(
          `INSERT INTO channel_order_events (store_id, order_id, event_type, from_status, to_status, reason, actor_user_id)
           VALUES ($1,$2,'created',NULL,'reserved',$3,$4)`, [storeId, id, 'Ghi nhận thủ công; đã giữ tồn tại kho giao.', auth.userId]
        );
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1,$2,'channel_order.created','channel_order',$3,$4::jsonb)`,
          [storeId, auth.userId, id, JSON.stringify({ channelProfileId: profileId, externalOrderRef, lineCount: items.length, totalVnd: total, warehouseId })]
        );
        const response = { order: publicOrder({
          ...created.rows[0], channel_code: profile.rows[0].channel_code, shop_label: profile.rows[0].shop_label,
          warehouse_name: warehouse.rows[0].name, line_count: items.length,
        }) };
        await saveIdempotentResponse(client, storeId, auth.userId, key, 201, response);
        return { status: 201, body: response, replayed: false };
      });
    } catch (error) {
      if (error?.code === '23505' && error.constraint === 'channel_orders_external_ref_key') {
        throw new ApiError(409, 'channel_order_exists', 'Mã đơn này đã được ghi nhận trong gian hàng. Hãy tải danh sách để kiểm tra đơn hiện có.');
      }
      throw error;
    }
    return finish(reply, outcome);
  });

  app.post('/api/stores/:storeId/channel-orders/:orderId/status', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Đơn hàng kênh bán không hợp lệ.');
    const nextStatus = request.body?.status;
    if (typeof nextStatus !== 'string' || !ORDER_STATUSES.has(nextStatus)) throw new ApiError(400, 'validation_error', 'Trạng thái đơn kênh bán không hợp lệ.');
    const expectedVersion = parseVersion(String(request.body?.version ?? ''));
    const reason = text(request.body?.reason || '', 'Lý do', 500, { optional: true });
    if (nextStatus === 'cancelled' && reason.length < 3) throw new ApiError(400, 'validation_error', 'Nhập lý do hủy đơn từ 3 đến 500 ký tự.');
    const key = requireKey(request);
    const canonical = { operation: 'channel_order_status', orderId: orderId.toLowerCase(), nextStatus, expectedVersion, reason };
    const outcome = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      requireOrderRole(membership.role);
      const replay = await reserveIdempotency(client, storeId, auth.userId, key, canonical);
      if (replay.replay) return replay.replay;
      const locked = await client.query(
        `SELECT id, channel_profile_id, fulfillment_warehouse_id, external_order_ref, fulfillment_status,
                version, total_vnd, payment_status_snapshot, customer_name_snapshot, internal_note,
                created_at, updated_at, packed_at, shipped_at, delivered_at, cancelled_at
         FROM channel_orders WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, orderId]
      );
      if (!locked.rowCount) throw new ApiError(404, 'channel_order_not_found', 'Không tìm thấy đơn hàng kênh bán.');
      const order = locked.rows[0];
      if (!canAccessWarehouse(membership, order.fulfillment_warehouse_id)) throw new ApiError(404, 'channel_order_not_found', 'Không tìm thấy đơn hàng kênh bán.');
      if (order.version !== expectedVersion) throw new ApiError(409, 'stale_version', 'Đơn đã được cập nhật ở thiết bị khác. Tải lại rồi thử lại.');
      const allowedTransitions = {
        reserved: new Set(['packed', 'cancelled']),
        packed: new Set(['shipped', 'cancelled']),
        shipped: new Set(['delivered']),
        delivered: new Set(),
        cancelled: new Set(),
      };
      if (!allowedTransitions[order.fulfillment_status]?.has(nextStatus)) throw new ApiError(409, 'channel_order_state_conflict', 'Trạng thái đơn không cho phép thao tác này. Hãy tải lại đơn để xem tiến độ mới nhất.');
      const lines = await client.query(
        `SELECT product_id, internal_sku_snapshot AS sku, quantity::text AS quantity
         FROM channel_order_lines WHERE store_id = $1 AND order_id = $2 ORDER BY product_id`, [storeId, orderId]
      );
      const warehouse = await client.query(`SELECT id FROM warehouses WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, order.fulfillment_warehouse_id]);
      if (!warehouse.rowCount) throw new ApiError(409, 'warehouse_not_found', 'Kho giao không còn tồn tại.');
      if (nextStatus === 'shipped' || nextStatus === 'cancelled') {
        for (const line of lines.rows) {
          const balance = await client.query(
            `SELECT on_hand::text AS on_hand, reserved::text AS reserved FROM inventory_balances
             WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3 FOR UPDATE`,
            [storeId, order.fulfillment_warehouse_id, line.product_id]
          );
          if (!balance.rowCount || asMilli(balance.rows[0].reserved) < asMilli(line.quantity)
            || (nextStatus === 'shipped' && asMilli(balance.rows[0].on_hand) < asMilli(line.quantity))) {
            throw new ApiError(409, 'channel_order_reservation_changed', `Tồn đang giữ cho ${line.sku} không còn khớp. Đơn chưa được cập nhật; cần đối chiếu kho.`);
          }
          if (nextStatus === 'cancelled') {
            await client.query(
              `UPDATE inventory_balances SET reserved = reserved - $4::numeric, version = version + 1, updated_at = now()
               WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3`,
              [storeId, order.fulfillment_warehouse_id, line.product_id, line.quantity]
            );
          } else {
            const updated = await client.query(
              `UPDATE inventory_balances SET on_hand = on_hand - $4::numeric, reserved = reserved - $4::numeric,
                version = version + 1, updated_at = now()
               WHERE store_id = $1 AND warehouse_id = $2 AND product_id = $3
               RETURNING on_hand::text AS on_hand`,
              [storeId, order.fulfillment_warehouse_id, line.product_id, line.quantity]
            );
            await client.query(
              `INSERT INTO inventory_movements
                 (store_id, warehouse_id, product_id, movement_type, quantity_delta, quantity_after, reason, source_type, source_id, actor_user_id)
               VALUES ($1,$2,$3,'sale',-$4::numeric,$5::numeric,$6,'channel_order',$7,$8)`,
              [storeId, order.fulfillment_warehouse_id, line.product_id, line.quantity, updated.rows[0].on_hand,
                `Xuất kho cho đơn kênh ${order.external_order_ref}`, orderId, auth.userId]
            );
          }
        }
      }
      const updated = await client.query(
        `UPDATE channel_orders SET fulfillment_status = $3, version = version + 1, updated_by = $4, updated_at = now(),
          packed_at = CASE WHEN $3 = 'packed' THEN now() ELSE packed_at END,
          shipped_at = CASE WHEN $3 = 'shipped' THEN now() ELSE shipped_at END,
          delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END,
          cancelled_at = CASE WHEN $3 = 'cancelled' THEN now() ELSE cancelled_at END
         WHERE store_id = $1 AND id = $2
         RETURNING id, channel_profile_id, fulfillment_warehouse_id, external_order_ref, fulfillment_status,
                   version, total_vnd, payment_status_snapshot, customer_name_snapshot, internal_note,
                   created_at, updated_at, packed_at, shipped_at, delivered_at, cancelled_at`,
        [storeId, orderId, nextStatus, auth.userId]
      );
      await client.query(
        `INSERT INTO channel_order_events (store_id, order_id, event_type, from_status, to_status, reason, actor_user_id)
         VALUES ($1,$2,'status_changed',$3,$4,$5,$6)`,
        [storeId, orderId, order.fulfillment_status, nextStatus, reason, auth.userId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
         VALUES ($1,$2,$3,'channel_order',$4,$5,$6::jsonb)`,
        [storeId, auth.userId, `channel_order.${nextStatus}`, orderId, reason, JSON.stringify({ fromStatus: order.fulfillment_status, toStatus: nextStatus, warehouseId: order.fulfillment_warehouse_id })]
      );
      const profile = await client.query('SELECT channel_code, shop_label FROM sales_channel_profiles WHERE store_id = $1 AND id = $2', [storeId, order.channel_profile_id]);
      const warehouseName = await client.query('SELECT name FROM warehouses WHERE store_id = $1 AND id = $2', [storeId, order.fulfillment_warehouse_id]);
      const response = { order: publicOrder({
        ...updated.rows[0], channel_code: profile.rows[0]?.channel_code, shop_label: profile.rows[0]?.shop_label,
        warehouse_name: warehouseName.rows[0]?.name, line_count: lines.rowCount,
      }) };
      await saveIdempotentResponse(client, storeId, auth.userId, key, 200, response);
      return { status: 200, body: response, replayed: false };
    });
    return finish(reply, outcome);
  });
}

module.exports = { registerChannelOrderRoutes, quantityMilli, quantityString, integerVnd, parseLines };
