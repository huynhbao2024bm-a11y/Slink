'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const Fastify = require('fastify');
const { registerAoLinksRoutes } = require('../src/http/register');

const storeId = 'c65c2ea6-81db-4c65-9ab3-53f774bf6b31';
const userId = '8be51a88-4726-462c-a7bb-1f40e0f6a812';

function setup({ role = 'owner', authenticated = true, csrfValid = true, failRunLog = false } = {}) {
  const app = Fastify({ logger: false });
  const inserted = [];
  const logged = [];
  const dependencies = {
    pool: {},
    env: {},
    authenticateSession: async () => {
      if (!authenticated) {
        const error = new Error('Vui lòng đăng nhập.');
        error.statusCode = 401;
        error.code = 'unauthorized';
        throw error;
      }
      return { userId };
    },
    verifyCsrf: () => {
      if (!csrfValid) {
        const error = new Error('CSRF không hợp lệ.');
        error.statusCode = 403;
        error.code = 'csrf_rejected';
        throw error;
      }
    },
    runWithStore: async (_pool, actorId, requestedStoreId, operation) => {
      assert.equal(actorId, userId);
      assert.equal(requestedStoreId, storeId);
      return operation({
        query: async (sql, params) => {
          inserted.push({ sql, params });
          return { rowCount: 1 };
        },
      }, { role });
    },
    recordRunLog: async (record) => {
      if (failRunLog) throw new Error('test log unavailable');
      logged.push(record);
    },
  };
  registerAoLinksRoutes(app, dependencies);
  app.setErrorHandler((error, _request, reply) => {
    reply.code(error.statusCode || 500).send({ error: { code: error.code || 'internal_error', message: error.message } });
  });
  return { app, inserted, logged };
}

const payload = {
  workflow: {
    id: 'debt-warning',
    name: 'Debt warning',
    trigger: { type: 'customer.balance_changed' },
    conditions: [{ path: 'data.balanceVnd', operator: 'greater_than', value: 50000 }],
    actions: [{ id: 'draft-message', type: 'message.preview', config: { body: 'private config' } }],
  },
  event: { type: 'customer.balance_changed', data: { balanceVnd: 60000, customerName: 'Synthetic customer' } },
};

test('dry-run endpoint enforces CSRF, store scope, role, and persists only redacted metadata', async (t) => {
  const { app, inserted, logged } = setup();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/aolinks/dry-runs`,
    payload,
  });

  assert.equal(response.statusCode, 201, response.body);
  assert.equal(response.json().status, 'matched');
  assert.equal(response.json().sideEffects, false);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].params[1], storeId);
  assert.equal(inserted[0].params[2], userId);
  assert.equal(inserted[0].params[5], 'customer.balance_changed');
  assert.equal(inserted[0].params[6], 'matched');
  assert.equal(JSON.stringify(inserted[0].params).includes('Synthetic customer'), false);
  assert.equal(JSON.stringify(inserted[0].params).includes('private config'), false);
  assert.deepEqual(logged.map(({ workflowId, status }) => ({ workflowId, status })), [
    { workflowId: 'debt-warning', status: 'matched' },
  ]);
  assert.equal(JSON.stringify(logged).includes('Synthetic customer'), false);
});

test('dry-run endpoint denies unauthenticated, invalid-CSRF, and cashier requests', async (t) => {
  const unauthenticated = setup({ authenticated: false });
  const invalidCsrf = setup({ csrfValid: false });
  const cashier = setup({ role: 'cashier' });
  t.after(async () => Promise.all([unauthenticated.app.close(), invalidCsrf.app.close(), cashier.app.close()]));

  const send = (app) => app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/aolinks/dry-runs`,
    payload,
  });
  assert.equal((await send(unauthenticated.app)).statusCode, 401);
  assert.equal((await send(invalidCsrf.app)).statusCode, 403);
  assert.equal((await send(cashier.app)).statusCode, 403);
  assert.equal(cashier.inserted.length, 0);
});

test('invalid workflow input creates no run record', async (t) => {
  const { app, inserted } = setup();
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/aolinks/dry-runs`,
    payload: { workflow: {}, event: {} },
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, 'workflow_validation_error');
  assert.equal(inserted.length, 0);
});

test('required activity-log failure fails the request instead of reporting success', async (t) => {
  const { app } = setup({ failRunLog: true });
  t.after(() => app.close());
  const response = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/aolinks/dry-runs`,
    payload,
  });
  assert.equal(response.statusCode, 500);
  assert.equal(response.json().error.code, 'internal_error');
});
