'use strict';

const { ApiError } = require('./auth');

function hasSelectedWarehouseScope(membership) {
  return membership?.role === 'stockkeeper' && membership.warehouse_scope_mode === 'selected';
}

function allowedWarehouseIds(membership) {
  if (!hasSelectedWarehouseScope(membership)) return null;
  return Array.isArray(membership.warehouse_scope_ids) ? membership.warehouse_scope_ids : [];
}

function canAccessWarehouse(membership, warehouseId) {
  const allowed = allowedWarehouseIds(membership);
  return allowed === null || allowed.includes(String(warehouseId).toLowerCase());
}

function requireWarehouseAccess(membership, warehouseId) {
  if (!canAccessWarehouse(membership, warehouseId)) {
    throw new ApiError(404, 'warehouse_not_found', 'Không tìm thấy kho đang hoạt động.');
  }
}

async function findAccessibleWarehouse(client, storeId, membership, requestedWarehouseId, { lock = false } = {}) {
  const allowed = allowedWarehouseIds(membership);
  const result = await client.query(
    `SELECT id, code, name, is_default, status
     FROM warehouses
     WHERE store_id = $1 AND status = 'active'
       AND ($2::uuid IS NULL OR id = $2)
       AND ($3::boolean = false OR id = ANY($4::uuid[]))
     ORDER BY is_default DESC, name, id
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [storeId, requestedWarehouseId || null, allowed !== null, allowed || []]
  );
  return result.rows[0] || null;
}

module.exports = {
  allowedWarehouseIds,
  canAccessWarehouse,
  findAccessibleWarehouse,
  hasSelectedWarehouseScope,
  requireWarehouseAccess,
};
