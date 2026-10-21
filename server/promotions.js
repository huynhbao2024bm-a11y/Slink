'use strict';

const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');

const MANAGE_ROLES = new Set(['owner', 'manager']);
const USE_ROLES = new Set(['owner', 'manager', 'cashier']);
const MAX_BIGINT = 9223372036854775807n;

function promotionCode(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'validation_error', 'Mã khuyến mãi không hợp lệ.');
  const code = value.normalize('NFKC').trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw new ApiError(400, 'validation_error', 'Mã khuyến mãi cần 3–32 ký tự chữ, số, gạch ngang hoặc gạch dưới.');
  return code;
}

function nonNegativeAmount(value, label, optional = false) {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const text = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : value;
  if ((typeof text !== 'string' && typeof text !== 'number') || !/^(0|[1-9]\d{0,18})$/.test(String(text))) {
    throw new ApiError(400, 'validation_error', `${label} phải là VND nguyên không âm.`);
  }
  const parsed = BigInt(text);
  if (parsed > MAX_BIGINT) throw new ApiError(400, 'validation_error', `${label} vượt giới hạn lưu trữ.`);
  return parsed;
}

function nullablePositiveInteger(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2147483647) throw new ApiError(400, 'validation_error', `${label} phải là số nguyên dương.`);
  return parsed;
}

function promotionInput(input) {
  const source = input || {};
  const code = promotionCode(source.code);
  const name = typeof source.name === 'string' ? source.name.normalize('NFKC').trim().replace(/\s+/g, ' ') : '';
  if (!name || Array.from(name).length > 120) throw new ApiError(400, 'validation_error', 'Tên chương trình cần từ 1 đến 120 ký tự.');
  if (!['fixed', 'percent'].includes(source.discountType)) throw new ApiError(400, 'validation_error', 'Loại khuyến mãi không hợp lệ.');
  let discountAmountVnd = null;
  let discountBasisPoints = null;
  if (source.discountType === 'fixed') {
    discountAmountVnd = nonNegativeAmount(source.discountVnd, 'Mức giảm');
    if (discountAmountVnd < 1n) throw new ApiError(400, 'validation_error', 'Mức giảm phải lớn hơn 0 VND.');
  } else {
    const percent = typeof source.discountPercent === 'number' ? String(source.discountPercent) : String(source.discountPercent ?? '');
    if (!/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$/.test(percent)) throw new ApiError(400, 'validation_error', 'Phần trăm giảm cần từ 0,01% đến 100%, tối đa 2 chữ số thập phân.');
    const basisPoints = Math.round(Number(percent) * 100);
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 1 || basisPoints > 10000) throw new ApiError(400, 'validation_error', 'Phần trăm giảm cần từ 0,01% đến 100%.');
    discountBasisPoints = basisPoints;
  }
  const minimumSubtotalVnd = nonNegativeAmount(source.minimumSubtotalVnd ?? '0', 'Giá trị đơn tối thiểu');
  const maximumDiscountVnd = nonNegativeAmount(source.maximumDiscountVnd, 'Mức giảm tối đa', true);
  if (maximumDiscountVnd !== null && maximumDiscountVnd < 1n) throw new ApiError(400, 'validation_error', 'Mức giảm tối đa phải lớn hơn 0 VND.');
  const usageLimit = nullablePositiveInteger(source.usageLimit, 'Tổng lượt sử dụng');
  const perCustomerLimit = nullablePositiveInteger(source.perCustomerLimit, 'Lượt sử dụng mỗi khách');
  const timestamp = (value, label) => {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) {
      throw new ApiError(400, 'validation_error', `${label} cần thời gian ISO kèm múi giờ.`);
    }
    return new Date(value).toISOString();
  };
  const startsAt = timestamp(source.startsAt, 'Thời điểm bắt đầu');
  const endsAt = timestamp(source.endsAt, 'Thời điểm kết thúc');
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new ApiError(400, 'validation_error', 'Thời điểm kết thúc phải sau thời điểm bắt đầu.');
  return {
    code, codeNormalized: code, name, discountType: source.discountType,
    discountAmountVnd: discountAmountVnd?.toString() ?? null, discountBasisPoints,
    minimumSubtotalVnd: minimumSubtotalVnd.toString(), maximumDiscountVnd: maximumDiscountVnd?.toString() ?? null,
    usageLimit, perCustomerLimit, startsAt, endsAt,
  };
}

function publicPromotion(row) {
  return {
    id: row.id, code: row.code, name: row.name, discountType: row.discount_type,
    discountVnd: row.discount_amount_vnd === null ? null : String(row.discount_amount_vnd),
    discountPercent: row.discount_basis_points === null ? null : Number(row.discount_basis_points) / 100,
    minimumSubtotalVnd: String(row.minimum_subtotal_vnd), maximumDiscountVnd: row.maximum_discount_vnd === null ? null : String(row.maximum_discount_vnd),
    startsAt: row.starts_at, endsAt: row.ends_at, usageLimit: row.usage_limit,
    perCustomerLimit: row.per_customer_limit, usageCount: row.usage_count,
    isActive: row.is_active, version: row.version, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

async function calculatePromotion(client, { storeId, code, customerId, subtotalVnd, lock = false }) {
  const normalizedCode = promotionCode(code);
  const subtotal = typeof subtotalVnd === 'bigint' ? subtotalVnd : nonNegativeAmount(subtotalVnd, 'Tạm tính');
  const result = await client.query(
    `SELECT *, now() AS database_now FROM promotions
     WHERE store_id = $1 AND code_normalized = $2${lock ? ' FOR UPDATE' : ''}`,
    [storeId, normalizedCode]
  );
  const promotion = result.rows[0];
  if (!promotion || !promotion.is_active) throw new ApiError(422, 'promotion_unavailable', 'Mã khuyến mãi không tồn tại hoặc đã ngừng áp dụng.');
  const now = new Date(promotion.database_now).getTime();
  if (promotion.starts_at && new Date(promotion.starts_at).getTime() > now) throw new ApiError(422, 'promotion_not_started', 'Mã khuyến mãi chưa đến thời gian áp dụng.');
  if (promotion.ends_at && new Date(promotion.ends_at).getTime() <= now) throw new ApiError(422, 'promotion_expired', 'Mã khuyến mãi đã hết hạn.');
  if (subtotal < BigInt(promotion.minimum_subtotal_vnd)) throw new ApiError(422, 'promotion_minimum_not_met', 'Đơn hàng chưa đạt giá trị tối thiểu của mã khuyến mãi.');
  if (promotion.usage_limit !== null && promotion.usage_count >= promotion.usage_limit) throw new ApiError(422, 'promotion_limit_reached', 'Mã khuyến mãi đã hết lượt sử dụng.');
  if (promotion.per_customer_limit !== null) {
    if (!customerId) throw new ApiError(422, 'promotion_customer_required', 'Hãy chọn khách hàng để dùng mã khuyến mãi này.');
    const customer = await client.query(`SELECT id FROM customers WHERE store_id = $1 AND id = $2 AND status = 'active'`, [storeId, customerId]);
    if (!customer.rowCount) throw new ApiError(404, 'customer_not_found', 'Không tìm thấy khách hàng đang hoạt động.');
    const used = await client.query(
      `SELECT COUNT(*)::int AS count FROM promotion_redemptions WHERE store_id = $1 AND promotion_id = $2 AND customer_id = $3`,
      [storeId, promotion.id, customerId]
    );
    if (Number(used.rows[0].count) >= promotion.per_customer_limit) throw new ApiError(422, 'promotion_customer_limit_reached', 'Khách hàng này đã dùng đủ lượt của mã khuyến mãi.');
  }
  let discountVnd = promotion.discount_type === 'fixed'
    ? BigInt(promotion.discount_amount_vnd)
    : (subtotal * BigInt(promotion.discount_basis_points)) / 10000n;
  if (promotion.maximum_discount_vnd !== null && discountVnd > BigInt(promotion.maximum_discount_vnd)) discountVnd = BigInt(promotion.maximum_discount_vnd);
  if (discountVnd > subtotal) discountVnd = subtotal;
  if (discountVnd <= 0n) throw new ApiError(422, 'promotion_discount_zero', 'Đơn hàng chưa đủ điều kiện để nhận mức giảm.');
  return { id: promotion.id, code: promotion.code, name: promotion.name, discountVnd };
}

async function consumePromotion(client, { storeId, promotionId }) {
  const updated = await client.query(
    `UPDATE promotions SET usage_count = usage_count + 1, updated_at = now()
     WHERE store_id = $1 AND id = $2 AND is_active AND (usage_limit IS NULL OR usage_count < usage_limit)
     RETURNING id`,
    [storeId, promotionId]
  );
  if (!updated.rowCount) throw new ApiError(409, 'promotion_limit_reached', 'Mã khuyến mãi vừa hết lượt sử dụng. Hãy kiểm tra lại đơn.');
}

function registerPromotionRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/promotions', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!MANAGE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý được xem chương trình khuyến mãi.');
      const result = await client.query(`SELECT * FROM promotions WHERE store_id = $1 ORDER BY is_active DESC, updated_at DESC, id`, [storeId]);
      return { promotions: result.rows.map(publicPromotion) };
    });
  });

  app.post('/api/stores/:storeId/promotions', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const input = promotionInput(request.body);
    try {
      const result = await withStore(pool, auth.userId, storeId, async (client, membership) => {
        if (!MANAGE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý được tạo mã khuyến mãi.');
        const inserted = await client.query(
          `INSERT INTO promotions (store_id, code, code_normalized, name, discount_type, discount_amount_vnd, discount_basis_points,
                                  minimum_subtotal_vnd, maximum_discount_vnd, starts_at, ends_at, usage_limit, per_customer_limit,
                                  created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING *`,
          [storeId, input.code, input.codeNormalized, input.name, input.discountType, input.discountAmountVnd,
            input.discountBasisPoints, input.minimumSubtotalVnd, input.maximumDiscountVnd, input.startsAt, input.endsAt,
            input.usageLimit, input.perCustomerLimit, auth.userId]
        );
        const row = inserted.rows[0];
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES ($1, $2, 'promotion.created', 'promotion', $3, jsonb_build_object('code', $4::text, 'discountType', $5::text))`,
          [storeId, auth.userId, row.id, row.code, row.discount_type]
        );
        return publicPromotion(row);
      });
      reply.code(201);
      return { promotion: result };
    } catch (error) {
      if (error?.code === '23505') throw new ApiError(409, 'promotion_code_exists', 'Mã này đã được dùng trong cửa hàng.');
      throw error;
    }
  });

  app.post('/api/stores/:storeId/promotions/:promotionId/archive', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, promotionId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(promotionId)) throw new ApiError(400, 'validation_error', 'Cửa hàng hoặc mã khuyến mãi không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!MANAGE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý được ngừng mã khuyến mãi.');
      const updated = await client.query(
        `UPDATE promotions SET is_active = false, version = version + 1, updated_by = $3, updated_at = now()
         WHERE store_id = $1 AND id = $2 AND is_active RETURNING *`, [storeId, promotionId, auth.userId]
      );
      if (!updated.rowCount) throw new ApiError(404, 'promotion_not_found', 'Không tìm thấy mã khuyến mãi đang hoạt động.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'promotion.archived', 'promotion', $3)`, [storeId, auth.userId, promotionId]
      );
      return { promotion: publicPromotion(updated.rows[0]) };
    });
  });

  app.post('/api/stores/:storeId/promotions/preview', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const code = promotionCode(request.body?.code);
    const customerId = request.body?.customerId || null;
    if (customerId !== null && (typeof customerId !== 'string' || !UUID_PATTERN.test(customerId))) throw new ApiError(400, 'validation_error', 'Khách hàng không hợp lệ.');
    const subtotalVnd = nonNegativeAmount(request.body?.subtotalVnd, 'Tạm tính');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!USE_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền dùng mã khuyến mãi.');
      const promotion = await calculatePromotion(client, { storeId, code, customerId, subtotalVnd });
      return { valid: true, promotion: { id: promotion.id, code: promotion.code, name: promotion.name, discountVnd: promotion.discountVnd.toString() } };
    });
  });
}

module.exports = { calculatePromotion, consumePromotion, promotionCode, registerPromotionRoutes };
