'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const createOfflineStore = require('../../offline-store');
const SlinkOfflineSync = require('../../offline-sync');
const conflictUi = require('../../offline-conflict-ui');

const migrationsDirectory = path.join(__dirname, '..', 'migrations');
const origin = 'http://slink.test';

function cookiesFrom(response) {
  const values = Array.isArray(response.headers['set-cookie']) ? response.headers['set-cookie'] : [response.headers['set-cookie']];
  return Object.fromEntries(values.map((value) => {
    const pair = value.split(';')[0];
    const separator = pair.indexOf('=');
    return [pair.slice(0, separator), pair.slice(separator + 1)];
  }));
}

function createMemoryIndexedDb() {
  const databases = new Map();
  function clone(val) { return val === undefined ? undefined : JSON.parse(JSON.stringify(val)); }
  function extractKey(obj, keyPath) { return keyPath ? obj?.[keyPath] : undefined; }
  function makeStore(dataMap, opts) {
    const indexes = new Map();
    const storeApi = {
      _data: dataMap,
      _opts: opts,
      _indexes: indexes,
      createIndex(name, keyPath) {
        const idx = { name, keyPath };
        indexes.set(name, idx);
        return idx;
      },
      index(name) {
        const idx = indexes.get(name);
        if (!idx) throw new Error(`Missing index ${name}`);
        return {
          getAll(filterKey) {
            const req = { result: null, onsuccess: null, onerror: null };
            queueMicrotask(() => {
              const all = [...dataMap.values()].map(clone);
              req.result = filterKey === undefined ? all : all.filter((row) => extractKey(row, idx.keyPath) === filterKey);
              req.onsuccess?.();
            });
            return req;
          },
        };
      },
      get(key) {
        const req = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          req.result = clone(dataMap.get(key));
          req.onsuccess?.();
        });
        return req;
      },
      getAll() {
        const req = { result: [], onsuccess: null, onerror: null };
        queueMicrotask(() => {
          req.result = [...dataMap.values()].map(clone);
          req.onsuccess?.();
        });
        return req;
      },
      put(value) {
        const copy = clone(value);
        const key = extractKey(copy, opts.keyPath);
        dataMap.set(key, copy);
        const req = { result: key, onsuccess: null, onerror: null };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
      add(value) { return storeApi.put(value); },
      delete(key) {
        dataMap.delete(key);
        const req = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    };
    return storeApi;
  }

  return {
    open(name) {
      const req = { result: null, error: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
      queueMicrotask(() => {
        let dbState = databases.get(name);
        const isNew = !dbState;
        if (!dbState) dbState = { stores: new Map() };
        const db = {
          createObjectStore(storeName, opts = {}) {
            const dataMap = new Map();
            const storeApi = makeStore(dataMap, opts);
            dbState.stores.set(storeName, storeApi);
            return storeApi;
          },
          transaction(names) {
            const tx = {
              oncomplete: null,
              onabort: null,
              onerror: null,
              error: null,
              objectStore(storeName) {
                const s = dbState.stores.get(storeName);
                if (!s) throw new Error(`Missing objectStore ${storeName}`);
                return s;
              },
              abort() { queueMicrotask(() => tx.onabort?.()); },
            };
            let scheduled = false;
            const scheduleComplete = () => {
              if (scheduled) return;
              scheduled = true;
              setTimeout(() => { tx.oncomplete?.(); }, 8);
            };
            const wrapped = {
              get oncomplete() { return tx.oncomplete; },
              set oncomplete(fn) { tx.oncomplete = fn; scheduleComplete(); },
              get onabort() { return tx.onabort; },
              set onabort(fn) { tx.onabort = fn; },
              get onerror() { return tx.onerror; },
              set onerror(fn) { tx.onerror = fn; },
              objectStore: (n) => tx.objectStore(n),
              abort: () => tx.abort(),
            };
            void names;
            return wrapped;
          },
          close() {},
        };
        databases.set(name, dbState);
        req.result = db;
        if (isNew) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
}

async function setupApp(t) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const migrations = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) await db.exec(await readFile(path.join(migrationsDirectory, migration), 'utf8'));
  await db.exec(`
    CREATE ROLE slink_app NOLOGIN;
    GRANT USAGE ON SCHEMA public TO slink_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO slink_app;
    REVOKE UPDATE, DELETE ON public.user_security_events FROM slink_app;
    REVOKE ALL ON public.order_internal_notes, public.order_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.order_internal_notes, public.order_tag_events TO slink_app;
    REVOKE ALL ON public.customer_tag_events FROM slink_app;
    GRANT SELECT, INSERT ON public.customer_tag_events TO slink_app;
    REVOKE ALL ON public.product_sale_price_history FROM slink_app;
    GRANT SELECT, INSERT ON public.product_sale_price_history TO slink_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;
    REVOKE UPDATE ON SEQUENCE public.customer_tag_events_id_seq FROM slink_app;
    REVOKE UPDATE ON SEQUENCE public.product_sale_price_history_id_seq FROM slink_app;
  `);
  const pool = createPGlitePool(db);
  const app = await buildServer({ pool, logger: false, env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin } });
  app.testDb = db;
  t.after(() => app.close());
  return { app, db };
}

async function inviteAndLoginStaff(app, storeId, ownerHeaders, email, role, displayName, password) {
  const invite = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/staff/invitations`,
    headers: ownerHeaders,
    payload: { email, role },
  });
  assert.equal(invite.statusCode, 201, invite.body);
  const inviteTok = new URLSearchParams(new URL(invite.json().developmentInviteUrl).hash.slice(1)).get('invite');
  const staffReg = await app.inject({
    method: 'POST',
    url: `/api/invitations/${inviteTok}/register`,
    headers: { origin },
    payload: { displayName, password },
  });
  assert.equal(staffReg.statusCode, 201, staffReg.body);
  const staffVerifyTok = new URLSearchParams(new URL(staffReg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: staffVerifyTok } });
  const staffLogin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password } });
  const cookies = cookiesFrom(staffLogin);
  return {
    userId: staffLogin.json().user.id,
    headers: {
      cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; '),
      origin,
      'x-csrf-token': cookies.slink_csrf,
    },
  };
}

async function createStoreAndActors(app) {
  const ownerEmail = 'conflict-owner@example.com';
  const password = 'correct horse battery staple 49';
  const reg = await app.inject({
    method: 'POST', url: '/api/auth/register', headers: { origin },
    payload: { email: ownerEmail, displayName: 'Chủ Shop', storeName: 'Tiệm Thử Nghiệm', password },
  });
  assert.equal(reg.statusCode, 201, reg.body);
  const verifyTok = new URLSearchParams(new URL(reg.json().developmentVerificationUrl).hash.slice(1)).get('token');
  await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token: verifyTok } });
  const ownerLogin = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email: ownerEmail, password } });
  const ownerCookies = cookiesFrom(ownerLogin);
  const ownerHeaders = {
    cookie: Object.entries(ownerCookies).map(([k, v]) => `${k}=${v}`).join('; '),
    origin,
    'x-csrf-token': ownerCookies.slink_csrf,
  };
  const storeId = ownerLogin.json().stores[0].id;
  const ownerUserId = ownerLogin.json().user.id;

  const cashier = await inviteAndLoginStaff(app, storeId, ownerHeaders, 'conflict-cashier@example.com', 'cashier', 'Thu Ngân Ca Chiều', password);
  const stockkeeper = await inviteAndLoginStaff(app, storeId, ownerHeaders, 'conflict-stock@example.com', 'stockkeeper', 'Thủ Kho Chính', password);

  const whRes = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/warehouses`, headers: ownerHeaders });
  const warehouseId = whRes.json().warehouses[0].id;

  const prodRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/products`,
    headers: ownerHeaders,
    payload: { sku: 'CF-MILK-01', name: 'Cà phê sữa đá', category: 'Đồ uống', unit: 'ly', salePriceVnd: 80000, costVnd: 25000, lowStockThreshold: 2, inventoryTracked: true },
  });
  assert.equal(prodRes.statusCode, 200, prodRes.body);
  const productId = prodRes.json().product.id;

  const purRes = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/purchases`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { warehouseId, items: [{ productId, quantity: 10, unitCostVnd: 25000 }], amountPaidVnd: 250000, method: 'bank_transfer' },
  });
  assert.equal(purRes.statusCode, 201, purRes.body);

  return {
    storeId,
    warehouseId,
    productId,
    ownerHeaders,
    ownerUserId,
    cashierHeaders: cashier.headers,
    cashierUserId: cashier.userId,
    stockkeeperHeaders: stockkeeper.headers,
  };
}

test('offline conflict inspect and owner resolution handle price changes, RBAC, double-sync guard, shift reassignment, and restock', async (t) => {
  const { app, db } = await setupApp(t);
  const { storeId, warehouseId, productId, ownerHeaders, cashierHeaders, cashierUserId, stockkeeperHeaders } = await createStoreAndActors(app);

  // Open shift 1
  const shift1Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: 100000 },
  });
  assert.equal(shift1Res.statusCode, 201, shift1Res.body);
  const shift1Id = shift1Res.json().session.id;

  // Server updates product price 80000 -> 90000 while cashier was offline
  const beforePrice1 = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products?limit=10`, headers: ownerHeaders });
  const priceUp1 = await app.inject({
    method: 'PUT',
    url: `/api/stores/${storeId}/products/${productId}`,
    headers: ownerHeaders,
    payload: { version: beforePrice1.json().products[0].version, salePriceVnd: 90000 },
  });
  assert.equal(priceUp1.statusCode, 200, priceUp1.body);

  const opKey1 = randomUUID();
  const offlineSale1 = {
    warehouseId,
    items: [{ productId, quantity: 1, expectedUnitPriceVnd: '80000' }],
    discountVnd: 0,
    totalVnd: 80000,
    amountReceivedVnd: 80000,
    tenders: [{ method: 'cash', amountReceivedVnd: 80000 }],
    offline: {
      deviceId: randomUUID(),
      occurredAt: new Date().toISOString(),
      cashSessionId: shift1Id,
      actorUserId: cashierUserId,
    },
  };

  // Cashier normal sync rejects with 409 offline_price_changed
  const failedSync = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashierHeaders, 'idempotency-key': opKey1 },
    payload: offlineSale1,
  });
  assert.equal(failedSync.statusCode, 409, failedSync.body);
  assert.equal(failedSync.json().error.code, 'offline_price_changed');

  // Inspect shows price delta and owner capabilities
  const inspect1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/inspect`,
    headers: ownerHeaders,
    payload: { kind: 'sale', operationKey: opKey1, payload: offlineSale1, issue: { code: 'offline_price_changed' } },
  });
  assert.equal(inspect1.statusCode, 200, inspect1.body);
  const ins1 = inspect1.json();
  assert.equal(ins1.alreadySynced, false);
  assert.equal(ins1.flags.hasPriceChange, true);
  assert.equal(ins1.offlineTotalVnd, '80000');
  assert.equal(ins1.serverTotalAtCurrentPricesVnd, '90000');
  assert.equal(ins1.totalDeltaVnd, '10000');
  assert.equal(ins1.canResolveHistoricalPrice, true);
  assert.equal(ins1.canResolveCurrentPriceWithDiscount, true);
  assert.match(ins1.explanationVi, /80000đ/);

  // Stockkeeper cannot inspect cash shift-close conflicts (403)
  const stockShiftDenied = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/inspect`,
    headers: stockkeeperHeaders,
    payload: { kind: 'shift-close', operationKey: randomUUID(), payload: { countedCashVnd: 100000 } },
  });
  assert.equal(stockShiftDenied.statusCode, 403, stockShiftDenied.body);

  // Non-UUID warehouseId returns 400 cleanly
  const badWhInspect = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/inspect`,
    headers: ownerHeaders,
    payload: { kind: 'stock-count', operationKey: randomUUID(), payload: { warehouseId: 'not-a-uuid', productId, count: 1 } },
  });
  assert.equal(badWhInspect.statusCode, 400, badWhInspect.body);

  // Cashier cannot resolve conflict directly (403)
  const cashierForbidden = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: { operationKey: opKey1, resolutionMode: 'accept_historical_price', reason: 'Thu ngân tự duyệt', salePayload: offlineSale1 },
  });
  assert.equal(cashierForbidden.statusCode, 403, cashierForbidden.body);

  // Owner resolves with accept_historical_price cleanly on behalf of cashier
  const resolveIdemKey1 = randomUUID();
  const resolve1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': resolveIdemKey1 },
    payload: {
      operationKey: opKey1,
      resolutionMode: 'accept_historical_price',
      reason: 'Khách đã trả 80k theo bảng giá cũ lúc mất mạng',
      salePayload: offlineSale1,
    },
  });
  assert.equal(resolve1.statusCode, 201, resolve1.body);
  const res1Body = resolve1.json();
  assert.equal(res1Body.order.subtotalVnd, '80000');
  assert.equal(res1Body.order.discountVnd, '0');
  assert.equal(res1Body.order.totalVnd, '80000');
  assert.equal(res1Body.order.items[0].unitPriceVnd, '80000');

  // Same idempotency key replays without duplicate order
  const replay1 = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': resolveIdemKey1 },
    payload: {
      operationKey: opKey1,
      resolutionMode: 'accept_historical_price',
      reason: 'Khách đã trả 80k theo bảng giá cũ lúc mất mạng',
      salePayload: offlineSale1,
    },
  });
  assert.equal(replay1.statusCode, 201);
  assert.equal(replay1.headers['idempotent-replayed'], 'true');

  // New idempotency key for same operationKey MUST reject with 409 offline_already_synced
  const secondResolveAttempt = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      operationKey: opKey1,
      resolutionMode: 'accept_historical_price',
      reason: 'Thử ghi đè lần hai',
      salePayload: offlineSale1,
    },
  });
  assert.equal(secondResolveAttempt.statusCode, 409, secondResolveAttempt.body);
  assert.equal(secondResolveAttempt.json().error.code, 'offline_already_synced');

  // Cashier retrying POST /sales with opKey1 MUST return 409 offline_already_synced cleanly (NOT 500 or duplicate!)
  const cashierRetry = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashierHeaders, 'idempotency-key': opKey1 },
    payload: offlineSale1,
  });
  assert.equal(cashierRetry.statusCode, 409, cashierRetry.body);
  assert.equal(cashierRetry.json().error.code, 'offline_already_synced');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 1);

  // Even when offline.actorUserId was omitted on resolve-sale, cashier retry with matched price STILL gets 409 offline_already_synced!
  const opKeyNoActor = randomUUID();
  const saleNoActor = {
    warehouseId,
    items: [{ productId, quantity: 1, expectedUnitPriceVnd: '90000' }],
    discountVnd: 0,
    totalVnd: 90000,
    amountReceivedVnd: 90000,
    tenders: [{ method: 'bank_transfer', amountReceivedVnd: 90000 }],
    offline: { deviceId: randomUUID(), occurredAt: new Date().toISOString(), cashSessionId: null },
  };
  const ownerNoActorResolve = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { operationKey: opKeyNoActor, resolutionMode: 'accept_historical_price', reason: 'Xác nhận thay thu ngân', salePayload: saleNoActor },
  });
  assert.equal(ownerNoActorResolve.statusCode, 201, ownerNoActorResolve.body);
  const cashierReplayMatchedPrice = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/sales`,
    headers: { ...cashierHeaders, 'idempotency-key': opKeyNoActor },
    payload: saleNoActor,
  });
  assert.equal(cashierReplayMatchedPrice.statusCode, 409, cashierReplayMatchedPrice.body);
  assert.equal(cashierReplayMatchedPrice.json().error.code, 'offline_already_synced');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 2);

  // Check inspect on opKey1 now reports alreadySynced = true
  const inspectDone = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/inspect`,
    headers: cashierHeaders,
    payload: { kind: 'sale', operationKey: opKey1, payload: offlineSale1 },
  });
  assert.equal(inspectDone.statusCode, 200);
  assert.equal(inspectDone.json().alreadySynced, true);
  assert.equal(inspectDone.json().existingEntityId, res1Body.order.id);

  // Verify audit & cashier attribution preserved
  const savedOrderRow = (await db.query('SELECT cashier_id FROM orders WHERE id = $1', [res1Body.order.id])).rows[0];
  assert.equal(savedOrderRow.cashier_id, cashierUserId);
  const auditRow = (await db.query(`SELECT action, metadata FROM audit_events WHERE action = 'offline_conflict.sale_resolved' AND entity_id = $1`, [res1Body.order.id])).rows[0];
  assert.ok(auditRow, 'Expected audit event for conflict resolution');
  assert.equal(auditRow.metadata.resolutionMode, 'accept_historical_price');

  // Case 2: Close shift 1, open shift 2, raise price to 95000 -> accept_current_price_with_discount + shift reassignment
  await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/${shift1Id}/close`,
    headers: { ...cashierHeaders, 'idempotency-key': randomUUID() },
    payload: { countedCashVnd: 180000, note: 'Đủ tiền ca sáng' },
  });
  const shift2Res = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/cash-register/open`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { openingFloatVnd: 200000 },
  });
  assert.equal(shift2Res.statusCode, 201, shift2Res.body);
  const shift2Id = shift2Res.json().session.id;

  const priceUp2 = await app.inject({
    method: 'PUT',
    url: `/api/stores/${storeId}/products/${productId}`,
    headers: ownerHeaders,
    payload: { version: priceUp1.json().product.version, salePriceVnd: 95000 },
  });
  assert.equal(priceUp2.statusCode, 200, priceUp2.body);

  const opKey2 = randomUUID();
  const offlineSale2 = {
    warehouseId,
    items: [{ productId, quantity: 1, expectedUnitPriceVnd: '80000' }],
    discountVnd: 0,
    totalVnd: 80000,
    amountReceivedVnd: 80000,
    tenders: [{ method: 'cash', amountReceivedVnd: 80000 }],
    offline: { deviceId: randomUUID(), occurredAt: new Date(Date.now() - 60_000).toISOString(), cashSessionId: shift1Id, actorUserId: cashierUserId },
  };

  const wrongShiftResolve = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { operationKey: opKey2, resolutionMode: 'accept_current_price_with_discount', reason: 'Cần chuyển ca', assignToCurrentCashSession: false, salePayload: offlineSale2 },
  });
  assert.equal(wrongShiftResolve.statusCode, 409, wrongShiftResolve.body);

  const resolvedDiscounted = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { operationKey: opKey2, resolutionMode: 'accept_current_price_with_discount', reason: 'Bù chiết khấu do giá mới tăng lên 95k', assignToCurrentCashSession: true, salePayload: offlineSale2 },
  });
  assert.equal(resolvedDiscounted.statusCode, 201, resolvedDiscounted.body);
  const dBody = resolvedDiscounted.json();
  assert.equal(dBody.order.subtotalVnd, '95000');
  assert.equal(dBody.order.discountVnd, '15000');
  assert.equal(dBody.order.totalVnd, '80000');
  assert.equal(dBody.order.items[0].unitPriceVnd, '95000');
  const cmShift = (await db.query(`SELECT cash_session_id FROM cash_movements WHERE source_id = $1`, [dBody.order.id])).rows[0];
  assert.equal(cmShift.cash_session_id, shift2Id);

  // Case 3: MAX_BIGINT overflow rejects cleanly with 400 (not 500)
  const overflowResolve = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: {
      operationKey: randomUUID(),
      resolutionMode: 'accept_historical_price',
      reason: 'Kiểm tra giới hạn bigint',
      salePayload: { ...saleNoActor, totalVnd: '9223372036854775808' },
    },
  });
  assert.equal(overflowResolve.statusCode, 400, overflowResolve.body);

  // Case 4: Stock shortfall (on_hand is now 7; offline sale wants 12) -> 409 no partial writes -> restock +5 -> resolves cleanly
  const opKey3 = randomUUID();
  const offlineSale3 = {
    warehouseId,
    items: [{ productId, quantity: 12, expectedUnitPriceVnd: '95000' }],
    discountVnd: 0,
    totalVnd: 1140000,
    amountReceivedVnd: 1140000,
    tenders: [{ method: 'bank_transfer', amountReceivedVnd: 1140000 }],
    offline: { deviceId: randomUUID(), occurredAt: new Date().toISOString(), cashSessionId: null, actorUserId: cashierUserId },
  };
  const inspectShort = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/inspect`,
    headers: ownerHeaders,
    payload: { kind: 'sale', operationKey: opKey3, payload: offlineSale3 },
  });
  assert.equal(inspectShort.statusCode, 200);
  assert.equal(inspectShort.json().flags.hasStockShortfall, true);
  assert.equal(inspectShort.json().canResolveHistoricalPrice, false);
  assert.equal(inspectShort.json().items[0].stockShortfall, '5');

  const rejectShort = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { operationKey: opKey3, resolutionMode: 'accept_historical_price', reason: 'Kiểm tra chặn âm kho', salePayload: offlineSale3 },
  });
  assert.equal(rejectShort.statusCode, 409, rejectShort.body);
  assert.equal(rejectShort.json().error.code, 'insufficient_stock');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 3);

  await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/purchases`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { warehouseId, items: [{ productId, quantity: 5, unitCostVnd: 25000 }], amountPaidVnd: 125000, method: 'bank_transfer' },
  });
  const resolveAfterRestock = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/resolve-sale`,
    headers: { ...ownerHeaders, 'idempotency-key': randomUUID() },
    payload: { operationKey: opKey3, resolutionMode: 'accept_historical_price', reason: 'Đã nhập thêm hàng đủ giao khách', salePayload: offlineSale3 },
  });
  assert.equal(resolveAfterRestock.statusCode, 201, resolveAfterRestock.body);

  // Case 5: Non-sale inspect (stock-count & shift-close)
  const scInspect = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/inspect`,
    headers: ownerHeaders,
    payload: { kind: 'stock-count', operationKey: randomUUID(), payload: { warehouseId, productId, count: 2, expectedInventoryVersion: 1 } },
  });
  assert.equal(scInspect.statusCode, 200);
  assert.equal(scInspect.json().canRequeueWithCurrentVersion, true);
  assert.ok(scInspect.json().currentServerVersion > 1);

  const shiftInspect = await app.inject({
    method: 'POST',
    url: `/api/stores/${storeId}/offline-conflicts/inspect`,
    headers: ownerHeaders,
    payload: { kind: 'shift-close', operationKey: randomUUID(), payload: { countedCashVnd: 270000, offline: { expectedCashVnd: '280000' } } },
  });
  assert.equal(shiftInspect.statusCode, 200);
  assert.equal(shiftInspect.json().serverExpectedCashVnd, '280000');
});

test('offline queue resolveConflict and requeueConflict unblock queued operations without JSON dumps', async (t) => {
  const { app } = await setupApp(t);
  const { storeId, warehouseId, productId, ownerHeaders, ownerUserId } = await createStoreAndActors(app);

  const beforePrice = await app.inject({ method: 'GET', url: `/api/stores/${storeId}/products?limit=10`, headers: ownerHeaders });
  const priceUp = await app.inject({
    method: 'PUT',
    url: `/api/stores/${storeId}/products/${productId}`,
    headers: ownerHeaders,
    payload: { version: beforePrice.json().products[0].version, salePriceVnd: 90000 },
  });
  assert.equal(priceUp.statusCode, 200, priceUp.body);

  const disk = createOfflineStore({ indexedDB: createMemoryIndexedDb(), name: `conflict-test-${randomUUID()}` });
  const scope = disk.scopeKey(ownerUserId, storeId);
  t.after(() => disk.close());

  const op1Key = randomUUID();
  const op2Key = randomUUID();
  const op3Key = randomUUID();
  const op1Payload = {
    warehouseId,
    items: [{ productId, quantity: 1, expectedUnitPriceVnd: '80000' }],
    discountVnd: 0,
    totalVnd: 80000,
    amountReceivedVnd: 80000,
    tenders: [{ method: 'bank_transfer', amountReceivedVnd: 80000 }],
    offline: { deviceId: randomUUID(), occurredAt: new Date().toISOString(), cashSessionId: null, actorUserId: ownerUserId },
  };
  const op2Payload = {
    warehouseId,
    items: [{ productId, quantity: 1, expectedUnitPriceVnd: '90000' }],
    discountVnd: 0,
    totalVnd: 90000,
    amountReceivedVnd: 90000,
    tenders: [{ method: 'bank_transfer', amountReceivedVnd: 90000 }],
    offline: { deviceId: randomUUID(), occurredAt: new Date().toISOString(), cashSessionId: null, actorUserId: ownerUserId },
  };
  const op3Payload = {
    warehouseId,
    productId,
    count: 6,
    expectedInventoryVersion: 999,
    offline: { deviceId: randomUUID(), occurredAt: new Date().toISOString(), cashSessionId: null, actorUserId: ownerUserId },
  };

  await disk.enqueue({ userId: ownerUserId, storeId, key: op1Key, kind: 'sale', url: `/api/stores/${storeId}/sales`, payload: op1Payload, queuedAt: new Date().toISOString() });
  await disk.enqueue({ userId: ownerUserId, storeId, key: op2Key, kind: 'sale', url: `/api/stores/${storeId}/sales`, payload: op2Payload, queuedAt: new Date().toISOString() });
  await disk.enqueue({ userId: ownerUserId, storeId, key: op3Key, kind: 'stock-count', url: `/api/stores/${storeId}/stock-adjustments`, payload: op3Payload, queuedAt: new Date().toISOString() });

  const injectFetch = async (url, init = {}) => {
    const res = await app.inject({
      method: init.method || 'GET',
      url,
      headers: { ...ownerHeaders, ...(init.headers || {}) },
      payload: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      async text() { return res.body; },
      async json() { return res.json(); },
    };
  };

  const sendNetwork = async (url, init = {}) => {
    const res = await app.inject({
      method: init.method || 'GET',
      url,
      headers: { ...ownerHeaders, ...(init.headers || {}) },
      payload: init.body !== undefined ? init.body : undefined,
    });
    const parsed = res.body ? res.json() : {};
    if (res.statusCode < 200 || res.statusCode >= 300) {
      const err = new Error(parsed?.error?.message || 'Lỗi mạng');
      err.status = res.statusCode;
      err.code = parsed?.error?.code || 'request_failed';
      throw err;
    }
    return parsed;
  };

  const sync = SlinkOfflineSync({
    disk,
    scope,
    owner: `tab-${randomUUID()}`,
    userId: ownerUserId,
    storeId,
    online: () => true,
    authenticate: async () => sendNetwork('/api/auth/me'),
    send: sendNetwork,
    refresh: async () => [
      { url: `/api/stores/${storeId}/warehouses`, fetchedAt: new Date().toISOString(), value: await sendNetwork(`/api/stores/${storeId}/warehouses`) },
      { url: `/api/stores/${storeId}/products?warehouseId=${warehouseId}`, fetchedAt: new Date().toISOString(), value: await sendNetwork(`/api/stores/${storeId}/products?warehouseId=${warehouseId}`) },
    ],
  });
  t.after(() => sync.close());

  const run1 = await sync.flush();
  assert.equal(run1.blocked, true);
  const opsAfterRun1 = await disk.operations(scope);
  assert.equal(opsAfterRun1[0].state, 'conflict');
  assert.equal(opsAfterRun1[1].state, 'ready');
  assert.equal(opsAfterRun1[2].state, 'ready');

  const inspection = await conflictUi.inspectOperation({
    storeId,
    operation: opsAfterRun1[0],
    csrfToken: ownerHeaders['x-csrf-token'],
    fetchImpl: injectFetch,
  });
  const html = conflictUi.buildConflictComparisonHtml(opsAfterRun1[0], inspection, { role: 'owner' });
  const slipText = conflictUi.buildReconciliationText(opsAfterRun1[0], inspection);
  assert.match(html, /Giữ nguyên giá lúc bán/);
  assert.ok(!html.includes('offline_price_changed'), 'UI must show plain Vietnamese instead of raw error code');
  assert.ok(!slipText.includes('{'), 'Slip must not dump raw JSON');

  // Whitespace reason safely defaults to Vietnamese audit message
  await conflictUi.resolveQueuedConflict({
    storeId,
    scope,
    disk,
    operation: opsAfterRun1[0],
    inspection,
    mode: 'accept_historical_price',
    reason: '   ',
    csrfToken: ownerHeaders['x-csrf-token'],
    idempotencyKey: randomUUID(),
    fetchImpl: injectFetch,
  });

  const run2 = await sync.flush();
  assert.equal(run2.blocked, true, `Unexpected run2 result: ${run2.error?.stack || JSON.stringify(run2)}`);
  const opsAfterRun2 = await disk.operations(scope);
  assert.equal(opsAfterRun2[0].state, 'acknowledged');
  assert.equal(opsAfterRun2[1].state, 'acknowledged');
  assert.equal(opsAfterRun2[2].state, 'conflict');

  const scInspection = await conflictUi.inspectOperation({
    storeId,
    operation: opsAfterRun2[2],
    csrfToken: ownerHeaders['x-csrf-token'],
    fetchImpl: injectFetch,
  });
  await conflictUi.requeueStockCountConflict({
    scope,
    disk,
    operation: opsAfterRun2[2],
    inspection: scInspection,
    nextKey: randomUUID(),
  });

  const run3 = await sync.flush();
  assert.equal(run3.pending, false);
  const opsFinal = await disk.operations(scope);
  assert.ok(opsFinal.every((op) => op.state === 'acknowledged'));
});
