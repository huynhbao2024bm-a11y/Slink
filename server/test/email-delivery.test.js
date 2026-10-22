'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ApiError, deliverEmail } = require('../auth');
const { buildServer, validateProductionConfig } = require('../index');

function productionEnv(overrides = {}) {
  return {
    NODE_ENV: 'production',
    APP_DATABASE_URL: 'postgresql://slink_app:password@db.example.test:5432/slink',
    PG_SSL: 'true',
    PUBLIC_ORIGIN: 'https://slink.example.test',
    EMAIL_DELIVERY_URL: 'https://api.resend.com/emails',
    EMAIL_DELIVERY_TOKEN: 'r'.repeat(40),
    EMAIL_FROM: 'Slink <no-reply@slink.example.test>',
    ...overrides,
  };
}

test('production configuration requires a sender address', () => {
  assert.throws(
    () => validateProductionConfig(productionEnv({ EMAIL_FROM: '' })),
    /EMAIL_FROM/,
  );
  assert.throws(
    () => validateProductionConfig(productionEnv({ EMAIL_FROM: 'Slink\nInjected: yes' })),
    /EMAIL_FROM/,
  );
  assert.doesNotThrow(() => validateProductionConfig(productionEnv()));
});

test('email provider request includes the configured sender and plain text body', async (t) => {
  const previousFetch = global.fetch;
  let sentRequest;
  global.fetch = async (url, options) => {
    sentRequest = { url: url.toString(), options };
    return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
  };
  t.after(() => { global.fetch = previousFetch; });

  const env = productionEnv();
  const result = await deliverEmail(env, 'owner@example.test', 'Confirm Slink', 'Open this confirmation link.', 'https://slink.example.test/verify');

  assert.deepEqual(result, { delivered: true });
  assert.equal(sentRequest.url, env.EMAIL_DELIVERY_URL);
  assert.equal(sentRequest.options.headers.authorization, `Bearer ${env.EMAIL_DELIVERY_TOKEN}`);
  assert.deepEqual(JSON.parse(sentRequest.options.body), {
    from: env.EMAIL_FROM,
    to: 'owner@example.test',
    subject: 'Confirm Slink',
    text: 'Open this confirmation link.',
  });
});

test('email provider rejection preserves only its HTTP status for diagnostics', async (t) => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ message: 'sender is not verified' }), { status: 422 });
  t.after(() => { global.fetch = previousFetch; });

  await assert.rejects(
    deliverEmail(productionEnv(), 'owner@example.test', 'Confirm Slink', 'Open this confirmation link.', 'https://slink.example.test/verify'),
    (error) => {
      assert.equal(error.code, 'email_unavailable');
      assert.equal(error.statusCode, 503);
      assert.equal(error.providerStatus, 422);
      assert.equal(error.message, 'Chưa thể gửi thư xác nhận. Vui lòng thử lại sau.');
      assert.doesNotMatch(error.message, /sender is not verified/);
      return true;
    },
  );
});

test('server preserves the safe 503 email error for the registration UI', async (t) => {
  const app = await buildServer({ logger: false, env: {} });
  app.post('/api/test-email-error', async () => {
    const error = new ApiError(503, 'email_unavailable', 'Tài khoản đã được tạo nhưng email xác nhận chưa gửi được.');
    error.providerStatus = 422;
    throw error;
  });
  t.after(() => app.close());

  const response = await app.inject({ method: 'POST', url: '/api/test-email-error' });

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.json(), {
    error: {
      code: 'email_unavailable',
      message: 'Tài khoản đã được tạo nhưng email xác nhận chưa gửi được.',
    },
  });
});
