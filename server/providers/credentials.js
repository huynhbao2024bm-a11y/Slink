'use strict';

const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');
const { assertSafeOutboundUrl } = require('./safe-url');

const ALLOWED_CREDENTIAL_KEYS = [
  'GHN_TOKEN',
  'GHN_SHOP_ID',
  'GHN_WEBHOOK_SECRET',
  'GHTK_TOKEN',
  'VTP_TOKEN',
  'SEPAY_WEBHOOK_TOKEN',
  'CASSO_SECURE_TOKEN',
  'PAYOS_CLIENT_ID',
  'PAYOS_API_KEY',
  'PAYOS_CHECKSUM_KEY',
  'MOMO_PARTNER_CODE',
  'MOMO_ACCESS_KEY',
  'MOMO_SECRET_KEY',
  'MOMO_ENDPOINT',
  'VNPAY_TMN_CODE',
  'VNPAY_HASH_SECRET',
  'MISA_EINVOICE_URL',
  'MISA_APP_ID',
  'MISA_SECRET',
  'VIETTEL_EINVOICE_URL',
  'VIETTEL_EINVOICE_USER',
  'VIETTEL_EINVOICE_PASS',
];

const ALLOWED_KEY_SET = new Set(ALLOWED_CREDENTIAL_KEYS);

function deriveEncryptionKey(env = process.env) {
  const configured = env.INTEGRATION_ENCRYPTION_KEY || env.SESSION_SECRET || env.APP_DATABASE_URL || '';
  if (env.NODE_ENV === 'production' && !String(configured).trim()) {
    throw new Error('Production requires INTEGRATION_ENCRYPTION_KEY (or SESSION_SECRET / APP_DATABASE_URL) for store secret encryption.');
  }
  const seed = String(configured || 'slink-local-dev-integration-key');
  return createHash('sha256').update(seed, 'utf8').digest();
}

function decryptStoreCredentials(encoded, env = process.env) {
  const raw = String(encoded || '').trim();
  if (!raw) return {};
  if (!raw.startsWith('v1:')) {
    throw new Error('Dữ liệu khóa tích hợp cửa hàng sai định dạng.');
  }
  const parts = raw.split(':');
  if (parts.length !== 4) {
    throw new Error('Dữ liệu khóa tích hợp cửa hàng không nguyên vẹn.');
  }
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', deriveEncryptionKey(env), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Nội dung khóa tích hợp cửa hàng không hợp lệ.');
    }
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (ALLOWED_KEY_SET.has(k) && typeof v === 'string' && v.trim()) {
        out[k] = v.trim();
      }
    }
    return out;
  } catch (err) {
    throw new Error(err?.message?.includes('khóa tích hợp') ? err.message : 'Không giải mã được khóa tích hợp cửa hàng (kiểm tra INTEGRATION_ENCRYPTION_KEY).');
  }
}

function encryptStoreCredentials(creds, env = process.env) {
  const clean = {};
  for (const [k, v] of Object.entries(creds || {})) {
    if (ALLOWED_KEY_SET.has(k) && typeof v === 'string' && v.trim()) {
      clean[k] = v.trim();
    }
  }
  if (!Object.keys(clean).length) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(env), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(clean), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function mergeCredentialUpdates(existingCreds, incomingCreds, clearKeys = []) {
  const next = { ...(existingCreds || {}) };
  const changedKeys = [];
  if (Array.isArray(clearKeys)) {
    for (const key of clearKeys) {
      if (ALLOWED_KEY_SET.has(key) && Object.prototype.hasOwnProperty.call(next, key)) {
        delete next[key];
        changedKeys.push(key);
      }
    }
  }
  if (incomingCreds && typeof incomingCreds === 'object' && !Array.isArray(incomingCreds)) {
    for (const [key, val] of Object.entries(incomingCreds)) {
      if (!ALLOWED_KEY_SET.has(key)) continue;
      if (typeof val !== 'string') continue;
      const trimmed = val.trim();
      if (!trimmed) continue;
      if (trimmed.length > 512) {
        throw new Error(`Giá trị cấu hình ${key} quá dài (tối đa 512 ký tự).`);
      }
      if (/_URL$|_ENDPOINT$/.test(key)) {
        assertSafeOutboundUrl(trimmed, { allowLocalInTest: false, label: key });
      }
      next[key] = trimmed;
      if (!changedKeys.includes(key)) changedKeys.push(key);
    }
  }
  return { next, changedKeys };
}

function maskValue(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.length <= 4) return '••••';
  return `••••${s.slice(-4)}`;
}

function buildStoreEnv(baseEnv, storeRow) {
  const storeCreds = decryptStoreCredentials(storeRow?.integration_secrets_enc, baseEnv);
  const sharedMode = String(baseEnv?.ALLOW_SHARED_HOST_INTEGRATIONS || '').toLowerCase() === 'true';
  const safeBase = { ...(baseEnv || {}) };
  if (!sharedMode) {
    for (const key of ALLOWED_CREDENTIAL_KEYS) {
      delete safeBase[key];
    }
  }
  return { ...safeBase, ...storeCreds };
}

function summarizeCredentialStatus(storeEnv) {
  const out = {};
  for (const key of ALLOWED_CREDENTIAL_KEYS) {
    const val = typeof storeEnv?.[key] === 'string' ? storeEnv[key].trim() : '';
    out[key] = {
      set: Boolean(val),
      masked: val ? maskValue(val) : '',
    };
  }
  return out;
}

module.exports = {
  ALLOWED_CREDENTIAL_KEYS,
  buildStoreEnv,
  decryptStoreCredentials,
  encryptStoreCredentials,
  mergeCredentialUpdates,
  summarizeCredentialStatus,
};
