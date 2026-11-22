'use strict';

const { createCipheriv, createDecipheriv, createHash, randomBytes } = require('node:crypto');

const ALLOWED_CREDENTIAL_KEYS = [
  'GHN_TOKEN',
  'GHN_SHOP_ID',
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
  const seed = String(
    env.INTEGRATION_ENCRYPTION_KEY
    || env.SESSION_SECRET
    || env.APP_DATABASE_URL
    || 'slink-local-dev-integration-key'
  );
  return createHash('sha256').update(seed, 'utf8').digest();
}

function decryptStoreCredentials(encoded, env = process.env) {
  const raw = String(encoded || '').trim();
  if (!raw || !raw.startsWith('v1:')) return {};
  const parts = raw.split(':');
  if (parts.length !== 4) return {};
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    const decipher = createDecipheriv('aes-256-gcm', deriveEncryptionKey(env), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    const parsed = JSON.parse(plain);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (ALLOWED_KEY_SET.has(k) && typeof v === 'string' && v.trim()) {
        out[k] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
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
        let parsed;
        try { parsed = new URL(trimmed); } catch {
          throw new Error(`Địa chỉ ${key} không hợp lệ.`);
        }
        if (!['https:', 'http:'].includes(parsed.protocol)) {
          throw new Error(`Địa chỉ ${key} phải dùng http/https.`);
        }
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
  return { ...baseEnv, ...storeCreds };
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
