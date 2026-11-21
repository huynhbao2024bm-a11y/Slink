'use strict';

const PERMISSION_KEYS = Object.freeze([
  'view_cost_price',
  'pos_max_discount_pct',
  'void_or_return_order',
  'record_cashbook',
  'view_reports',
  'edit_products',
]);

const PERMISSION_KEY_SET = new Set(PERMISSION_KEYS);

const BOOLEAN_PERMISSION_KEYS = new Set([
  'view_cost_price',
  'void_or_return_order',
  'record_cashbook',
  'view_reports',
  'edit_products',
]);

const OWNER_FULL_PERMISSIONS = Object.freeze({
  view_cost_price: true,
  pos_max_discount_pct: 100,
  void_or_return_order: true,
  record_cashbook: true,
  view_reports: true,
  edit_products: true,
});

const ZERO_PERMISSIONS = Object.freeze({
  view_cost_price: false,
  pos_max_discount_pct: 0,
  void_or_return_order: false,
  record_cashbook: false,
  view_reports: false,
  edit_products: false,
});

const ROLE_DEFAULTS = Object.freeze({
  owner: OWNER_FULL_PERMISSIONS,
  manager: Object.freeze({
    view_cost_price: true,
    pos_max_discount_pct: 100,
    void_or_return_order: true,
    record_cashbook: true,
    view_reports: true,
    edit_products: true,
  }),
  cashier: Object.freeze({
    view_cost_price: false,
    pos_max_discount_pct: 100,
    void_or_return_order: false,
    record_cashbook: false,
    view_reports: false,
    edit_products: false,
  }),
  stockkeeper: Object.freeze({
    view_cost_price: true,
    pos_max_discount_pct: 0,
    void_or_return_order: false,
    record_cashbook: false,
    view_reports: false,
    edit_products: true,
  }),
  accountant: Object.freeze({
    view_cost_price: true,
    pos_max_discount_pct: 0,
    void_or_return_order: false,
    record_cashbook: true,
    view_reports: true,
    edit_products: false,
  }),
});

function createApiError(statusCode, code, message) {
  const { ApiError } = require('./auth');
  return new ApiError(statusCode, code, message);
}

function normalizeStoredPermissions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const normalized = {};
  for (const key of PERMISSION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (key === 'pos_max_discount_pct') {
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 100) {
        normalized[key] = value;
      }
    } else if (typeof value === 'boolean') {
      normalized[key] = value;
    }
  }
  return normalized;
}

function validatePermissionsInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw createApiError(400, 'validation_error', 'Dữ liệu phân quyền không hợp lệ.');
  }
  const validated = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!PERMISSION_KEY_SET.has(key)) {
      throw createApiError(400, 'validation_error', 'Khóa phân quyền không được hỗ trợ.');
    }
    if (key === 'pos_max_discount_pct') {
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 100) {
        throw createApiError(400, 'validation_error', 'Giới hạn % giảm giá POS phải là số nguyên từ 0 đến 100.');
      }
      validated[key] = value;
    } else if (BOOLEAN_PERMISSION_KEYS.has(key)) {
      if (typeof value !== 'boolean') {
        throw createApiError(400, 'validation_error', 'Giá trị quyền phải là boolean (true/false).');
      }
      validated[key] = value;
    }
  }
  return validated;
}

function resolveEffectivePermissions(role, rawPermissions) {
  if (role === 'owner') return { ...OWNER_FULL_PERMISSIONS };
  const base = ROLE_DEFAULTS[role] || ZERO_PERMISSIONS;
  return {
    ...base,
    ...normalizeStoredPermissions(rawPermissions),
  };
}

function getEffectivePermissions(membership) {
  if (membership?.effectivePermissions) return membership.effectivePermissions;
  return resolveEffectivePermissions(membership?.role, membership?.permissions);
}

function getPosMaxDiscountPct(membership) {
  return getEffectivePermissions(membership).pos_max_discount_pct;
}

function hasPermission(membership, key) {
  if (key === 'pos_max_discount_pct') return getPosMaxDiscountPct(membership) > 0;
  return Boolean(getEffectivePermissions(membership)[key]);
}

function requirePermission(membership, key, message = 'Tài khoản này không có quyền thực hiện thao tác này.') {
  if (!hasPermission(membership, key)) {
    throw createApiError(403, 'forbidden', message);
  }
}

module.exports = {
  BOOLEAN_PERMISSION_KEYS,
  OWNER_FULL_PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_DEFAULTS,
  ZERO_PERMISSIONS,
  getEffectivePermissions,
  getPosMaxDiscountPct,
  hasPermission,
  normalizeStoredPermissions,
  requirePermission,
  resolveEffectivePermissions,
  validatePermissionsInput,
};
