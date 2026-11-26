'use strict';

const {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} = require('node:crypto');

const CAPTCHA_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CAPTCHA_LENGTH = 6;
const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const REG_TICKET_TTL_MS = 10 * 60 * 1000;
const MAX_TRACKED_CHALLENGES = 20000;

const consumedChallenges = new Map();

function pruneConsumedChallenges(now = Date.now()) {
  if (consumedChallenges.size <= 5000) return;
  for (const [id, expiresAt] of consumedChallenges.entries()) {
    if (expiresAt <= now) consumedChallenges.delete(id);
  }
  while (consumedChallenges.size > MAX_TRACKED_CHALLENGES) {
    const oldest = consumedChallenges.keys().next().value;
    if (!oldest) break;
    consumedChallenges.delete(oldest);
  }
}

function isCaptchaRequired(env = {}) {
  return Boolean(
    env.NODE_ENV === 'production'
    || env.REQUIRE_AUTH_CAPTCHA === 'true'
    || (env.NODE_ENV === 'development' && env.DISABLE_AUTH_CAPTCHA !== 'true')
  );
}

function deriveCaptchaSecret(env = {}) {
  const raw = env.CAPTCHA_SECRET
    || env.INTEGRATION_ENCRYPTION_KEY
    || env.APP_DATABASE_URL
    || env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (typeof raw === 'string' && raw.trim()) {
    return createHmac('sha256', 'slink-captcha-v1').update(raw.trim()).digest();
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('CAPTCHA_SECRET or application secret key is required in production.');
  }
  return createHmac('sha256', 'slink-captcha-v1').update('slink-dev-captcha-secret').digest();
}

function signPayload(secret, payload) {
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sigB64 = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sigB64}`;
}

function verifySignedToken(secret, token) {
  if (typeof token !== 'string' || !token.includes('.') || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
  let actualSig;
  try {
    actualSig = Buffer.from(sigB64, 'base64url');
  } catch {
    return null;
  }
  if (actualSig.length !== expectedSig.length || !timingSafeEqual(actualSig, expectedSig)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    return payload;
  } catch {
    return null;
  }
}

function answerHash(id, answer) {
  return createHash('sha256').update(`${id}:${String(answer || '').trim().toUpperCase()}`).digest();
}

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderDistortedSvg(code) {
  const width = 220;
  const height = 64;
  const palette = ['#0f172a', '#1e293b', '#0f4c5c', '#1d3557', '#334155', '#14532d'];
  const wavePaths = [];
  for (let i = 0; i < 4; i += 1) {
    const y1 = 12 + randomInt(0, 42);
    const y2 = 8 + randomInt(0, 48);
    const y3 = 12 + randomInt(0, 42);
    const c1x = 40 + randomInt(0, 45);
    const c2x = 125 + randomInt(0, 50);
    const stroke = palette[randomInt(0, palette.length)];
    const opacity = (0.18 + randomInt(0, 18) / 100).toFixed(2);
    wavePaths.push(
      `<path d="M 6 ${y1} C ${c1x} ${y2}, ${c2x} ${64 - y2}, ${width - 6} ${y3}" fill="none" stroke="${stroke}" stroke-width="${(1.1 + randomInt(0, 10) / 10).toFixed(1)}" opacity="${opacity}"/>`
    );
  }
  const dots = [];
  for (let i = 0; i < 28; i += 1) {
    const cx = randomInt(8, width - 8);
    const cy = randomInt(6, height - 6);
    const r = (0.8 + randomInt(0, 14) / 10).toFixed(1);
    const fill = palette[randomInt(0, palette.length)];
    const opacity = (0.15 + randomInt(0, 25) / 100).toFixed(2);
    dots.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}"/>`);
  }
  const chars = [];
  const stepX = 31;
  const startX = 24;
  for (let i = 0; i < code.length; i += 1) {
    const ch = escapeXml(code[i]);
    const x = startX + i * stepX + randomInt(-4, 5);
    const y = 41 + randomInt(-6, 7);
    const angle = randomInt(-18, 19);
    const fontSize = randomInt(26, 33);
    const skewX = randomInt(-10, 11);
    const color = palette[randomInt(0, palette.length)];
    const weight = randomInt(0, 2) === 0 ? '700' : '800';
    chars.push(
      `<text x="${x}" y="${y}" font-family="ui-monospace, 'Cascadia Mono', Consolas, monospace" font-size="${fontSize}" font-weight="${weight}" fill="${color}" stroke="${color}" stroke-width="0.4" transform="rotate(${angle} ${x} ${y}) skewX(${skewX})" text-anchor="middle">${ch}</text>`
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Mã xác nhận bảo mật">${[
    `<rect width="${width}" height="${height}" rx="10" fill="#f8fafc"/>`,
    `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="9" fill="none" stroke="#e2e8f0"/>`,
    ...dots,
    ...wavePaths,
    ...chars,
  ].join('')}</svg>`;
}

function generateChallengeData(env = {}) {
  const secret = deriveCaptchaSecret(env);
  let code = '';
  for (let i = 0; i < CAPTCHA_LENGTH; i += 1) {
    code += CAPTCHA_ALPHABET[randomInt(0, CAPTCHA_ALPHABET.length)];
  }
  const id = randomBytes(16).toString('base64url');
  const exp = Date.now() + CAPTCHA_TTL_MS;
  const payload = {
    kind: 'captcha',
    id,
    exp,
    h: answerHash(id, code).toString('hex'),
  };
  const captchaToken = signPayload(secret, payload);
  const svg = renderDistortedSvg(code);
  const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  return {
    code,
    challenge: {
      captchaToken,
      imageDataUrl,
      expiresInSeconds: Math.round(CAPTCHA_TTL_MS / 1000),
    },
  };
}

function createCaptchaChallenge(env = {}) {
  return generateChallengeData(env).challenge;
}

function createCaptchaChallengeWithAnswer(env = {}) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('createCaptchaChallengeWithAnswer is only available in test mode.');
  }
  const generated = generateChallengeData(env);
  return {
    ...generated.challenge,
    _answer: generated.code,
  };
}

function verifyCaptchaChallenge(env = {}, token, answer) {
  const secret = deriveCaptchaSecret(env);
  const payload = verifySignedToken(secret, token);
  const now = Date.now();
  if (
    !payload
    || payload.kind !== 'captcha'
    || typeof payload.id !== 'string'
    || !payload.id
    || typeof payload.exp !== 'number'
    || payload.exp <= now
    || typeof payload.h !== 'string'
  ) {
    return false;
  }
  pruneConsumedChallenges(now);
  if (consumedChallenges.has(payload.id)) {
    return false;
  }
  // Burn single-use challenge before comparing answer to block brute-force retries.
  consumedChallenges.set(payload.id, payload.exp);
  const cleanAnswer = typeof answer === 'string' ? answer.trim().toUpperCase() : '';
  if (!cleanAnswer || cleanAnswer.length !== CAPTCHA_LENGTH) {
    return false;
  }
  let expectedBuf;
  try {
    expectedBuf = Buffer.from(payload.h, 'hex');
  } catch {
    return false;
  }
  const actualBuf = answerHash(payload.id, cleanAnswer);
  return actualBuf.length === expectedBuf.length && timingSafeEqual(actualBuf, expectedBuf);
}

function createRegistrationTicket(env = {}, { emailNormalized }) {
  const secret = deriveCaptchaSecret(env);
  const id = randomBytes(16).toString('base64url');
  const exp = Date.now() + REG_TICKET_TTL_MS;
  return signPayload(secret, {
    kind: 'reg',
    id,
    exp,
    email: String(emailNormalized || '').trim().toLowerCase(),
  });
}

function verifyRegistrationTicket(env = {}, ticket, emailNormalized) {
  const secret = deriveCaptchaSecret(env);
  const payload = verifySignedToken(secret, ticket);
  const now = Date.now();
  if (
    !payload
    || payload.kind !== 'reg'
    || typeof payload.id !== 'string'
    || !payload.id
    || typeof payload.exp !== 'number'
    || payload.exp <= now
    || typeof payload.email !== 'string'
  ) {
    return false;
  }
  pruneConsumedChallenges(now);
  const regKey = `reg:${payload.id}`;
  if (consumedChallenges.has(regKey)) {
    return false;
  }
  const cleanEmail = String(emailNormalized || '').trim().toLowerCase();
  if (!cleanEmail || payload.email !== cleanEmail) {
    return false;
  }
  consumedChallenges.set(regKey, payload.exp);
  return true;
}

module.exports = {
  CAPTCHA_ALPHABET,
  CAPTCHA_LENGTH,
  isCaptchaRequired,
  createCaptchaChallenge,
  createCaptchaChallengeWithAnswer,
  verifyCaptchaChallenge,
  createRegistrationTicket,
  verifyRegistrationTicket,
};
