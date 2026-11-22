'use strict';

const { createHash, randomUUID, timingSafeEqual } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { findBankByBin } = require('../banks-vn');
const { getIntegrationCatalog } = require('./providers');
const {
  buildStoreEnv,
  decryptStoreCredentials,
  encryptStoreCredentials,
  mergeCredentialUpdates,
  summarizeCredentialStatus,
} = require('./providers/credentials');
const { insertCashMovement } = require('./cashbook-ledger');
const { extractOrderCodeFromMemo, verifyAndParseBankWebhook } = require('./providers/bank-webhook');
const { issueEinvoice } = require('./providers/einvoice');
const { createMomoPaymentSession, verifyMomoIpnSignature } = require('./providers/payment-gateways');
const { createShippingOrder, previewShippingOrder, verifyGhnConnection } = require('./providers/shipping');

const ADMIN_ROLES = new Set(['owner', 'manager']);
const WEBHOOK_PROVIDERS = new Set(['none', 'sepay', 'casso', 'payos']);
const EINVOICE_PROVIDERS = new Set(['none', 'misa', 'viettel', 'vnpt']);
const SHIPPING_PROVIDERS = new Set(['none', 'ghn', 'ghtk', 'viettelpost']);

function validateSettingsInput(body) {
  const b = body || {};
  const bankBin = String(b.bankBin || '').trim();
  const bankAccountNumber = String(b.bankAccountNumber || '').trim();
  const bankAccountName = String(b.bankAccountName || '').trim();
  const bankWebhookProvider = String(b.bankWebhookProvider || 'none').trim().toLowerCase();
  const einvoiceProvider = String(b.einvoiceProvider || 'none').trim().toLowerCase();
  const taxCode = String(b.taxCode || '').trim();
  const einvoiceTemplateCode = String(b.einvoiceTemplateCode || '').trim();
  const einvoiceSerial = String(b.einvoiceSerial || '').trim();
  const shippingProvider = String(b.shippingProvider || 'none').trim().toLowerCase();

  let bankCode = String(b.bankCode || '').trim();
  let bankName = String(b.bankName || '').trim();
  if (bankBin) {
    if (!/^\d{6}$/.test(bankBin)) throw new ApiError(400, 'validation_error', 'Mã BIN ngân hàng NAPAS phải gồm 6 chữ số.');
    const found = findBankByBin(bankBin);
    if (found) {
      bankCode = found.code;
      bankName = found.shortName;
    } else {
      bankCode = bankCode.slice(0, 20);
      bankName = bankName.slice(0, 120);
    }
    if (!bankAccountNumber || !/^[A-Za-z0-9]{4,32}$/.test(bankAccountNumber)) {
      throw new ApiError(400, 'validation_error', 'Số tài khoản ngân hàng gồm 4–32 chữ cái/số không khoảng trắng.');
    }
  } else if (bankAccountNumber) {
    throw new ApiError(400, 'validation_error', 'Hãy chọn ngân hàng khi nhập số tài khoản.');
  }
  if (bankAccountName.length > 120) throw new ApiError(400, 'validation_error', 'Tên chủ tài khoản tối đa 120 ký tự.');
  if (!WEBHOOK_PROVIDERS.has(bankWebhookProvider)) throw new ApiError(400, 'validation_error', 'Cổng gạch nợ ngân hàng không hợp lệ.');
  if (!EINVOICE_PROVIDERS.has(einvoiceProvider)) throw new ApiError(400, 'validation_error', 'Nhà cung cấp hóa đơn điện tử không hợp lệ.');
  if (taxCode && !/^[0-9-]{10,14}$/.test(taxCode)) throw new ApiError(400, 'validation_error', 'Mã số thuế gồm 10–14 ký tự số/gạch ngang.');
  if (einvoiceTemplateCode.length > 40 || einvoiceSerial.length > 40) throw new ApiError(400, 'validation_error', 'Mẫu số hoặc ký hiệu hóa đơn tối đa 40 ký tự.');
  if (!SHIPPING_PROVIDERS.has(shippingProvider)) throw new ApiError(400, 'validation_error', 'Đơn vị vận chuyển không hợp lệ.');

  return {
    bankBin,
    bankCode: bankBin ? bankCode : '',
    bankName: bankBin ? bankName : '',
    bankAccountNumber: bankBin ? bankAccountNumber : '',
    bankAccountName: bankBin ? bankAccountName : '',
    bankWebhookProvider,
    einvoiceProvider,
    taxCode,
    einvoiceTemplateCode,
    einvoiceSerial,
    shippingProvider,
  };
}

function resolveOrigin(request, env) {
  if (env.PUBLIC_ORIGIN) return String(env.PUBLIC_ORIGIN).replace(/\/$/, '');
  const proto = request.protocol || 'http';
  const host = request.headers.host || '127.0.0.1:3000';
  return `${proto}://${host}`;
}

function registerIntegrationRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/integrations/status', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client) => {
      const res = await client.query(
        `SELECT id, name, bank_bin, bank_code, bank_name, bank_account_number, bank_account_name,
                bank_webhook_provider, einvoice_provider, tax_code, einvoice_template_code,
                einvoice_serial, shipping_provider, integration_secrets_enc
         FROM stores WHERE id = $1 AND status = 'active'`,
        [storeId]
      );
      if (!res.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng.');
      const row = res.rows[0];
      const storeEnv = buildStoreEnv(env, row);
      const baseOrigin = resolveOrigin(request, env);
      return {
        settings: {
          bankBin: row.bank_bin || '',
          bankCode: row.bank_code || '',
          bankName: row.bank_name || '',
          bankAccountNumber: row.bank_account_number || '',
          bankAccountName: row.bank_account_name || '',
          bankWebhookProvider: row.bank_webhook_provider || 'none',
          einvoiceProvider: row.einvoice_provider || 'none',
          taxCode: row.tax_code || '',
          einvoiceTemplateCode: row.einvoice_template_code || '',
          einvoiceSerial: row.einvoice_serial || '',
          shippingProvider: row.shipping_provider || 'none',
        },
        webhookUrls: {
          sepay: `${baseOrigin}/api/webhooks/bank-transfer/sepay/${storeId}`,
          casso: `${baseOrigin}/api/webhooks/bank-transfer/casso/${storeId}`,
          payos: `${baseOrigin}/api/webhooks/bank-transfer/payos/${storeId}`,
          momo: `${baseOrigin}/api/webhooks/momo/${storeId}`,
          ghn: `${baseOrigin}/api/webhooks/shipping/ghn/${storeId}`,
        },
        ghnShopId: String(storeEnv.GHN_SHOP_ID || ''),
        credentials: summarizeCredentialStatus(storeEnv),
        connectors: getIntegrationCatalog(storeEnv, row),
      };
    });
  });

  app.put('/api/stores/:storeId/integrations/settings', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const input = validateSettingsInput(request.body);
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ADMIN_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý mới được cấu hình tích hợp.');
      const cur = await client.query(
        `SELECT integration_secrets_enc FROM stores WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [storeId]
      );
      if (!cur.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng.');
      const existingCreds = decryptStoreCredentials(cur.rows[0].integration_secrets_enc, env);
      let merged;
      try {
        merged = mergeCredentialUpdates(existingCreds, request.body?.credentials, request.body?.clearCredentials);
      } catch (err) {
        throw new ApiError(400, 'validation_error', err.message || 'Thông tin khóa kết nối không hợp lệ.');
      }
      const nextEnc = merged.changedKeys.length
        ? encryptStoreCredentials(merged.next, env)
        : cur.rows[0].integration_secrets_enc;
      const updated = await client.query(
        `UPDATE stores
         SET bank_bin = $2, bank_code = $3, bank_name = $4, bank_account_number = $5, bank_account_name = $6,
             bank_webhook_provider = $7, einvoice_provider = $8, tax_code = $9,
             einvoice_template_code = $10, einvoice_serial = $11, shipping_provider = $12,
             integration_secrets_enc = $13, updated_at = now()
         WHERE id = $1 AND status = 'active'
         RETURNING id, bank_bin, bank_code, bank_name, bank_account_number, bank_account_name,
                   bank_webhook_provider, einvoice_provider, tax_code, einvoice_template_code,
                   einvoice_serial, shipping_provider, integration_secrets_enc`,
        [
          storeId, input.bankBin, input.bankCode, input.bankName, input.bankAccountNumber, input.bankAccountName,
          input.bankWebhookProvider, input.einvoiceProvider, input.taxCode,
          input.einvoiceTemplateCode, input.einvoiceSerial, input.shippingProvider, nextEnc,
        ]
      );
      if (!updated.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'store.integrations_updated', 'store', $1,
                 jsonb_build_object('bankCode', $3::text, 'bankWebhookProvider', $4::text, 'einvoiceProvider', $5::text, 'shippingProvider', $6::text, 'updatedCredentialKeys', $7::jsonb))`,
        [storeId, auth.userId, input.bankCode, input.bankWebhookProvider, input.einvoiceProvider, input.shippingProvider, JSON.stringify(merged.changedKeys)]
      );
      const row = updated.rows[0];
      const storeEnv = buildStoreEnv(env, row);
      return {
        settings: input,
        ghnShopId: String(storeEnv.GHN_SHOP_ID || ''),
        credentials: summarizeCredentialStatus(storeEnv),
        connectors: getIntegrationCatalog(storeEnv, row),
      };
    });
  });

  app.post('/api/webhooks/bank-transfer/:provider/:storeId', async (request, reply) => {
    const { provider, storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    const digest = createHash('sha256').update(JSON.stringify(request.body || {})).digest();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.store_id', $1, true)", [storeId]);

      const storeCheck = await client.query(
        `SELECT s.id, s.bank_webhook_provider, s.bank_account_number, s.integration_secrets_enc,
                (SELECT m.user_id FROM memberships m WHERE m.store_id = s.id AND m.status = 'active' AND m.role = 'owner' ORDER BY m.joined_at, m.created_at LIMIT 1) AS owner_user_id
         FROM stores s WHERE s.id = $1 AND s.status = 'active'`,
        [storeId]
      );
      if (!storeCheck.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng.');
      const storeRow = storeCheck.rows[0];
      const storeEnv = buildStoreEnv(env, storeRow);
      const parsed = verifyAndParseBankWebhook(provider, request.headers, request.body, storeEnv);
      if (!parsed.valid) {
        throw new ApiError(parsed.statusCode || 401, parsed.code || 'invalid_webhook_signature', parsed.message);
      }
      if (storeRow.bank_webhook_provider !== String(provider).toLowerCase()) {
        throw new ApiError(403, 'webhook_provider_disabled', 'Cửa hàng chưa bật cổng đối soát này.');
      }
      if (!storeRow.owner_user_id) throw new ApiError(409, 'store_owner_missing', 'Không xác định được chủ cửa hàng.');
      if (parsed.ignore || !Array.isArray(parsed.events) || !parsed.events.length) {
        await client.query('COMMIT');
        return reply.code(200).send({ ok: true, processed: 0, ignored: true, reason: parsed.reason || 'no_credit_events' });
      }
      await client.query("SELECT set_config('app.user_id', $1, true)", [storeRow.owner_user_id]);

      const storeAccClean = String(storeRow.bank_account_number || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const summary = [];
      for (const evt of parsed.events) {
        await client.query('SAVEPOINT sp_evt');
        try {
          const dup = await client.query(
            `SELECT id, status FROM integration_webhook_events WHERE store_id = $1 AND provider = $2 AND external_event_id = $3`,
            [storeId, String(provider).toLowerCase(), evt.externalEventId]
          );
          if (dup.rowCount) {
            await client.query('RELEASE SAVEPOINT sp_evt');
            summary.push({ externalEventId: evt.externalEventId, status: 'duplicate' });
            continue;
          }

          let evtStatus = 'ignored';
          let matchedOrderId = null;
          let detail = evt.orderNumber ? `Không tìm thấy đơn ${evt.orderNumber}` : 'Nội dung chuyển khoản không có mã đơn Slink';
          const incomingAcc = String(evt.bankAccountNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

          if (storeAccClean && incomingAcc && incomingAcc !== storeAccClean) {
            evtStatus = 'ignored';
            detail = 'Số tài khoản thụ hưởng trên giao dịch không khớp cửa hàng.';
          } else if (evt.orderNumber) {
            const normalizedCode = String(evt.orderNumber).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            const preCheck = await client.query(
              `SELECT id, customer_id FROM orders
               WHERE store_id = $1
                 AND (upper(order_number) = upper($2) OR replace(upper(order_number), '-', '') = $3)
                 AND status NOT IN ('voided', 'returned')
               LIMIT 1`,
              [storeId, evt.orderNumber, normalizedCode]
            );
            if (preCheck.rowCount) {
              if (preCheck.rows[0].customer_id) {
                await client.query(`SELECT id FROM customers WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, preCheck.rows[0].customer_id]);
              }
              const ordRes = await client.query(
                `SELECT id, order_number, customer_id, total_vnd::text AS total_vnd, status
                 FROM orders
                 WHERE store_id = $1 AND id = $2 AND status NOT IN ('voided', 'returned')
                 FOR UPDATE`,
                [storeId, preCheck.rows[0].id]
              );
              if (ordRes.rowCount) {
                const ord = ordRes.rows[0];
                matchedOrderId = ord.id;
                const balRes = await client.query(
                  `SELECT
                     COALESCE((SELECT SUM(amount_vnd) FROM payments WHERE store_id = $1 AND order_id = $2 AND status = 'succeeded'), 0)::text AS paid_vnd,
                     COALESCE((SELECT SUM(refund_total_vnd) FROM returns WHERE store_id = $1 AND order_id = $2 AND status = 'completed'), 0)::text AS returned_vnd,
                     COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id WHERE f.store_id = $1 AND r.store_id = $1 AND r.order_id = $2 AND r.status = 'completed' AND f.status = 'succeeded'), 0)::text AS refunded_vnd`,
                  [storeId, ord.id]
                );
                const total = BigInt(ord.total_vnd);
                const paid = BigInt(balRes.rows[0].paid_vnd);
                const returned = BigInt(balRes.rows[0].returned_vnd);
                const refunded = BigInt(balRes.rows[0].refunded_vnd);
                const remaining = total - returned - paid + refunded;
                const incoming = BigInt(evt.amountVnd);

                if (remaining <= 0n) {
                  evtStatus = 'ignored';
                  detail = `Đơn ${ord.order_number} đã thanh toán đủ hoặc đã đối soát trả hàng trước đó.`;
                } else {
                  const applyVnd = incoming > remaining ? remaining : incoming;
                  const paymentId = randomUUID();
                  const scopedRef = `${storeId}:${evt.externalEventId}`;
                  await client.query(
                    `INSERT INTO payments (id, store_id, order_id, method, status, amount_vnd, provider, provider_reference, recorded_by, occurred_at)
                     VALUES ($1, $2, $3, 'bank_transfer', 'succeeded', $4, $5, $6, $7, $8::timestamptz)`,
                    [paymentId, storeId, ord.id, applyVnd.toString(), String(provider).toLowerCase(), scopedRef, storeRow.owner_user_id, evt.occurredAt]
                  );
                  await insertCashMovement(client, {
                    storeId,
                    direction: 'in',
                    category: 'Bán hàng (Webhook CK)',
                    amountVnd: applyVnd.toString(),
                    method: 'bank_transfer',
                    sourceType: 'order_payment',
                    sourceId: paymentId,
                    note: `Tự động đối soát ${provider.toUpperCase()} đơn ${ord.order_number}`,
                    actorUserId: storeRow.owner_user_id,
                    occurredAt: evt.occurredAt,
                    counterpartyKind: ord.customer_id ? 'customer' : null,
                    counterpartyId: ord.customer_id || null,
                  });
                  if (ord.customer_id) {
                    const ordDebit = await client.query(
                      `SELECT 1 FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2 AND source_type = 'order' AND source_id = $3 LIMIT 1`,
                      [storeId, ord.customer_id, ord.id]
                    );
                    if (ordDebit.rowCount) {
                      await client.query(
                        `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id, occurred_at)
                         VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6, $7::timestamptz)`,
                        [storeId, ord.customer_id, applyVnd.toString(), paymentId, `Webhook ${provider.toUpperCase()} đơn ${ord.order_number}`, storeRow.owner_user_id, evt.occurredAt]
                      );
                    }
                  }
                  await client.query(
                    `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
                     VALUES ($1, $2, 'payment.webhook_reconciled', 'order', $3, $4,
                             jsonb_build_object('provider', $5::text, 'externalEventId', $6::text, 'amountVnd', $7::text))`,
                    [storeId, storeRow.owner_user_id, ord.id, `Webhook ${provider} gạch nợ ${applyVnd.toString()} đ`, String(provider).toLowerCase(), evt.externalEventId, applyVnd.toString()]
                  );
                  evtStatus = 'processed';
                  detail = `Đã gạch nợ ${applyVnd.toString()} đ cho đơn ${ord.order_number}`;
                }
              }
            }
          }

          await client.query(
            `INSERT INTO integration_webhook_events (store_id, provider, external_event_id, payload_digest, matched_order_id, status, detail)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [storeId, String(provider).toLowerCase(), evt.externalEventId, digest, matchedOrderId, evtStatus, detail]
          );
          await client.query('RELEASE SAVEPOINT sp_evt');
          summary.push({ externalEventId: evt.externalEventId, status: evtStatus, matchedOrderId, detail });
        } catch (evtErr) {
          await client.query('ROLLBACK TO SAVEPOINT sp_evt');
          if (evtErr.code === '23505') {
            summary.push({ externalEventId: evt.externalEventId, status: 'duplicate' });
          } else {
            throw evtErr;
          }
        }
      }

      await client.query('COMMIT');
      return reply.code(200).send({ ok: true, results: summary });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/stores/:storeId/orders/:orderId/einvoice', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Thông tin đơn hàng không hợp lệ.');

    const snapshot = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!new Set(['owner', 'manager', 'accountant', 'cashier']).has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền xuất hóa đơn điện tử.');
      }
      const st = await client.query(
        `SELECT einvoice_provider, tax_code, einvoice_template_code, einvoice_serial, integration_secrets_enc FROM stores WHERE id = $1 AND status = 'active'`,
        [storeId]
      );
      const ord = await client.query(
        `SELECT o.id, o.order_number, o.status, o.total_vnd::text, o.discount_vnd::text, o.einvoice_status,
                c.name AS customer_name, c.phone AS customer_phone
         FROM orders o LEFT JOIN customers c ON c.store_id = o.store_id AND c.id = o.customer_id
         WHERE o.store_id = $1 AND o.id = $2`,
        [storeId, orderId]
      );
      if (!ord.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      if (ord.rows[0].status === 'voided') throw new ApiError(409, 'order_voided', 'Không thể phát hành hóa đơn điện tử cho đơn đã hủy.');
      if (ord.rows[0].einvoice_status === 'issued') throw new ApiError(409, 'einvoice_already_issued', 'Đơn hàng này đã phát hành hóa đơn điện tử.');
      const lines = await client.query(
        `SELECT sku_snapshot, product_name_snapshot, unit_snapshot, quantity, unit_price_vnd::text, line_total_vnd::text
         FROM order_lines WHERE store_id = $1 AND order_id = $2 ORDER BY id`,
        [storeId, orderId]
      );
      return { storeConfig: st.rows[0], order: { ...ord.rows[0], lines: lines.rows } };
    });

    const provider = snapshot.storeConfig.einvoice_provider;
    if (!provider || provider === 'none') {
      throw new ApiError(400, 'einvoice_provider_unset', 'Hãy chọn nhà cung cấp Hóa đơn điện tử trong Cài đặt tích hợp.');
    }
    const result = await issueEinvoice(provider, snapshot.order, snapshot.storeConfig, buildStoreEnv(env, snapshot.storeConfig));
    if (!result.ok) throw new ApiError(result.statusCode || 503, result.code || 'einvoice_failed', result.message);

    return withStore(pool, auth.userId, storeId, async (client) => {
      const claim = await client.query(
        `UPDATE orders SET einvoice_provider = $3, einvoice_number = $4, einvoice_lookup_code = $5, einvoice_status = 'issued', updated_at = now()
         WHERE store_id = $1 AND id = $2 AND einvoice_status <> 'issued' AND status <> 'voided'
         RETURNING id`,
        [storeId, orderId, provider, result.invoiceNumber, result.lookupCode]
      );
      if (!claim.rowCount) throw new ApiError(409, 'einvoice_already_issued', 'Đơn hàng này vừa được phát hành hóa đơn trước đó.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'order.einvoice_issued', 'order', $3, jsonb_build_object('provider', $4::text, 'invoiceNumber', $5::text))`,
        [storeId, auth.userId, orderId, provider, result.invoiceNumber]
      );
      return { einvoiceStatus: 'issued', provider, invoiceNumber: result.invoiceNumber, lookupCode: result.lookupCode };
    });
  });

  app.post('/api/stores/:storeId/orders/:orderId/shipping', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Thông tin đơn hàng không hợp lệ.');

    const snapshot = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!new Set(['owner', 'manager', 'cashier', 'stockkeeper']).has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền tạo vận đơn.');
      }
      const st = await client.query(`SELECT name, phone, address, shipping_provider, integration_secrets_enc FROM stores WHERE id = $1 AND status = 'active'`, [storeId]);
      const ord = await client.query(
        `SELECT id, order_number, status, total_vnd::text, shipping_tracking_code FROM orders WHERE store_id = $1 AND id = $2`,
        [storeId, orderId]
      );
      if (!ord.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      if (ord.rows[0].status === 'voided') throw new ApiError(409, 'order_voided', 'Không thể tạo vận đơn cho đơn đã hủy.');
      if (ord.rows[0].shipping_tracking_code) throw new ApiError(409, 'shipping_already_created', 'Đơn hàng đã có mã vận đơn.');
      const lines = await client.query(
        `SELECT product_name_snapshot, quantity, unit_price_vnd::text FROM order_lines WHERE store_id = $1 AND order_id = $2`,
        [storeId, orderId]
      );
      return { storeProfile: st.rows[0] || {}, defaultProvider: st.rows[0]?.shipping_provider, order: { ...ord.rows[0], lines: lines.rows } };
    });

    const provider = String(request.body?.provider || snapshot.defaultProvider || '').toLowerCase();
    if (!provider || provider === 'none') {
      throw new ApiError(400, 'shipping_provider_unset', 'Hãy chọn đơn vị vận chuyển (GHN hoặc GHTK) trong Cài đặt tích hợp.');
    }
    const result = await createShippingOrder(provider, snapshot.order, request.body || {}, buildStoreEnv(env, snapshot.storeProfile), snapshot.storeProfile);
    if (!result.ok) throw new ApiError(result.statusCode || 503, result.code || 'shipping_failed', result.message);

    return withStore(pool, auth.userId, storeId, async (client) => {
      const claim = await client.query(
        `UPDATE orders SET shipping_provider = $3, shipping_tracking_code = $4, shipping_fee_vnd = $5, shipping_status = $6, updated_at = now()
         WHERE store_id = $1 AND id = $2 AND shipping_tracking_code = '' AND status <> 'voided'
         RETURNING id`,
        [storeId, orderId, provider, result.trackingCode, result.feeVnd || '0', result.status || 'ready_to_pick']
      );
      if (!claim.rowCount) throw new ApiError(409, 'shipping_already_created', 'Đơn hàng vừa được tạo vận đơn trước đó.');
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'order.shipping_created', 'order', $3, jsonb_build_object('provider', $4::text, 'trackingCode', $5::text))`,
        [storeId, auth.userId, orderId, provider, result.trackingCode]
      );
      return { provider, trackingCode: result.trackingCode, feeVnd: result.feeVnd, expectedDeliveryTime: result.expectedDeliveryTime || '', status: result.status };
    });
  });

  app.post('/api/stores/:storeId/orders/:orderId/shipping/preview', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Thông tin đơn hàng không hợp lệ.');

    const snapshot = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!new Set(['owner', 'manager', 'cashier', 'stockkeeper', 'accountant']).has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền tính phí vận chuyển.');
      }
      const st = await client.query(`SELECT name, phone, address, shipping_provider, integration_secrets_enc FROM stores WHERE id = $1 AND status = 'active'`, [storeId]);
      const ord = await client.query(
        `SELECT id, order_number, status, total_vnd::text FROM orders WHERE store_id = $1 AND id = $2`,
        [storeId, orderId]
      );
      if (!ord.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      const lines = await client.query(
        `SELECT product_name_snapshot, quantity, unit_price_vnd::text FROM order_lines WHERE store_id = $1 AND order_id = $2`,
        [storeId, orderId]
      );
      return { storeProfile: st.rows[0] || {}, defaultProvider: st.rows[0]?.shipping_provider, order: { ...ord.rows[0], lines: lines.rows } };
    });

    const provider = String(request.body?.provider || snapshot.defaultProvider || 'ghn').toLowerCase();
    const result = await previewShippingOrder(provider, snapshot.order, request.body || {}, buildStoreEnv(env, snapshot.storeProfile), snapshot.storeProfile);
    if (!result.ok) throw new ApiError(result.statusCode || 503, result.code || 'shipping_preview_failed', result.message);
    return {
      provider: result.provider,
      shopId: result.shopId,
      feeVnd: result.feeVnd,
      expectedDeliveryTime: result.expectedDeliveryTime,
      sortCode: result.sortCode,
    };
  });

  app.post('/api/stores/:storeId/integrations/ghn/verify', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const storeRow = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!ADMIN_ROLES.has(membership.role)) throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý mới được kiểm tra kết nối đối tác.');
      const st = await client.query(`SELECT integration_secrets_enc FROM stores WHERE id = $1 AND status = 'active'`, [storeId]);
      return st.rows[0] || {};
    });
    const verified = await verifyGhnConnection(buildStoreEnv(env, storeRow));
    if (!verified.ok) throw new ApiError(verified.statusCode || 503, verified.code || 'ghn_verify_failed', verified.message);
    return verified;
  });

  app.post('/api/stores/:storeId/orders/:orderId/momo-payment', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, orderId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(orderId)) throw new ApiError(400, 'validation_error', 'Thông tin đơn hàng không hợp lệ.');

    const snapshot = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!new Set(['owner', 'manager', 'cashier', 'accountant']).has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Tài khoản này không có quyền tạo thanh toán MoMo.');
      }
      const st = await client.query(`SELECT integration_secrets_enc FROM stores WHERE id = $1 AND status = 'active'`, [storeId]);
      const ord = await client.query(
        `SELECT id, order_number, status, total_vnd::text AS total_vnd FROM orders WHERE store_id = $1 AND id = $2`,
        [storeId, orderId]
      );
      if (!ord.rowCount) throw new ApiError(404, 'order_not_found', 'Không tìm thấy đơn hàng.');
      if (ord.rows[0].status === 'voided') throw new ApiError(409, 'order_voided', 'Không thể thu tiền cho đơn đã hủy.');
      const balRes = await client.query(
        `SELECT
           COALESCE((SELECT SUM(amount_vnd) FROM payments WHERE store_id = $1 AND order_id = $2 AND status = 'succeeded'), 0)::text AS paid_vnd,
           COALESCE((SELECT SUM(refund_total_vnd) FROM returns WHERE store_id = $1 AND order_id = $2 AND status = 'completed'), 0)::text AS returned_vnd,
           COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id WHERE f.store_id = $1 AND r.store_id = $1 AND r.order_id = $2 AND r.status = 'completed' AND f.status = 'succeeded'), 0)::text AS refunded_vnd`,
        [storeId, orderId]
      );
      const remaining = BigInt(ord.rows[0].total_vnd) - BigInt(balRes.rows[0].returned_vnd) - BigInt(balRes.rows[0].paid_vnd) + BigInt(balRes.rows[0].refunded_vnd);
      if (remaining <= 0n) throw new ApiError(409, 'order_already_paid', 'Đơn hàng này đã thanh toán đủ.');
      return { storeRow: st.rows[0] || {}, orderNumber: ord.rows[0].order_number, amountVnd: remaining.toString() };
    });

    const baseOrigin = resolveOrigin(request, env);
    const session = await createMomoPaymentSession({
      storeId,
      orderId,
      orderNumber: snapshot.orderNumber,
      amountVnd: snapshot.amountVnd,
      redirectUrl: `${baseOrigin}/?orderId=${encodeURIComponent(orderId)}`,
      ipnUrl: `${baseOrigin}/api/webhooks/momo/${encodeURIComponent(storeId)}`,
    }, buildStoreEnv(env, snapshot.storeRow));
    if (!session.ok) throw new ApiError(session.statusCode || 503, session.code || 'momo_payment_failed', session.message);

    return {
      provider: 'momo',
      orderId,
      orderNumber: snapshot.orderNumber,
      amountVnd: snapshot.amountVnd,
      requestId: session.requestId,
      payUrl: session.payUrl,
      qrCodeUrl: session.qrCodeUrl,
      deeplink: session.deeplink,
    };
  });

  app.post('/api/webhooks/momo/:storeId', async (request, reply) => {
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const body = request.body || {};

    let extraOrderId = '';
    let extraOrderNumber = '';
    if (typeof body.extraData === 'string' && body.extraData.trim()) {
      try {
        const decoded = JSON.parse(Buffer.from(body.extraData.trim(), 'base64').toString('utf8'));
        if (decoded && typeof decoded === 'object') {
          if (typeof decoded.storeId === 'string' && decoded.storeId.trim() && decoded.storeId.trim() !== storeId) {
            return reply.code(200).send({ ok: true, processed: 0, ignored: true, reason: 'store_mismatch' });
          }
          if (typeof decoded.orderId === 'string' && UUID_PATTERN.test(decoded.orderId)) extraOrderId = decoded.orderId;
          if (typeof decoded.orderNumber === 'string') extraOrderNumber = decoded.orderNumber.trim();
        }
      } catch {
        // Ignore malformed extraData and fall back to orderInfo/orderId parsing
      }
    }
    const fallbackCode = extractOrderCodeFromMemo(`${body.orderInfo || ''} ${body.orderId || ''}`);
    const orderNumberCandidate = extraOrderNumber || fallbackCode || '';
    const digest = createHash('sha256').update(JSON.stringify(body)).digest();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.store_id', $1, true)", [storeId]);
      const storeCheck = await client.query(
        `SELECT s.id, s.integration_secrets_enc,
                (SELECT m.user_id FROM memberships m WHERE m.store_id = s.id AND m.status = 'active' AND m.role = 'owner' ORDER BY m.joined_at, m.created_at LIMIT 1) AS owner_user_id
         FROM stores s WHERE s.id = $1 AND s.status = 'active'`,
        [storeId]
      );
      if (!storeCheck.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng.');
      const storeEnv = buildStoreEnv(env, storeCheck.rows[0]);
      const verified = verifyMomoIpnSignature(body, storeEnv);
      if (!verified.configured) {
        throw new ApiError(503, 'integration_not_configured', 'Cổng MoMo IPN chưa được cấu hình khóa đối tác.');
      }
      if (!verified.valid) {
        throw new ApiError(401, 'invalid_webhook_signature', 'Chữ ký MoMo IPN không hợp lệ.');
      }
      if (Number(body.resultCode) !== 0) {
        await client.query('ROLLBACK');
        return reply.code(200).send({ ok: true, processed: 0, ignored: true, reason: 'non_zero_result_code' });
      }
      const amountRaw = String(Math.round(Number(body.amount || 0)));
      if (!/^[1-9]\d{0,15}$/.test(amountRaw)) {
        await client.query('ROLLBACK');
        return reply.code(200).send({ ok: true, processed: 0, ignored: true, reason: 'invalid_amount' });
      }
      const transId = String(body.transId || body.requestId || '').trim();
      if (!transId) throw new ApiError(400, 'missing_event_id', 'Thiếu mã giao dịch MoMo.');
      const externalEventId = `momo:${transId}`;
      const ownerUserId = storeCheck.rows[0].owner_user_id;
      if (!ownerUserId) throw new ApiError(409, 'store_owner_missing', 'Không xác định được chủ cửa hàng.');
      await client.query("SELECT set_config('app.user_id', $1, true)", [ownerUserId]);

      const dup = await client.query(
        `SELECT id, status FROM integration_webhook_events WHERE store_id = $1 AND provider = 'momo' AND external_event_id = $2`,
        [storeId, externalEventId]
      );
      if (dup.rowCount) {
        await client.query('COMMIT');
        return reply.code(200).send({ ok: true, results: [{ externalEventId, status: 'duplicate' }] });
      }

      let evtStatus = 'ignored';
      let matchedOrderId = null;
      let detail = 'Không tìm thấy đơn hàng khớp giao dịch MoMo.';
      const normalizedCode = orderNumberCandidate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      const preCheck = await client.query(
        `SELECT id, customer_id FROM orders
         WHERE store_id = $1
           AND (($2::uuid IS NOT NULL AND id = $2::uuid)
             OR ($3::text <> '' AND (upper(order_number) = upper($3) OR replace(upper(order_number), '-', '') = $4)))
           AND status NOT IN ('voided', 'returned')
         LIMIT 1`,
        [storeId, extraOrderId || null, orderNumberCandidate, normalizedCode]
      );

      if (preCheck.rowCount) {
        if (preCheck.rows[0].customer_id) {
          await client.query(`SELECT id FROM customers WHERE store_id = $1 AND id = $2 FOR UPDATE`, [storeId, preCheck.rows[0].customer_id]);
        }
        const ordRes = await client.query(
          `SELECT id, order_number, customer_id, total_vnd::text AS total_vnd
           FROM orders WHERE store_id = $1 AND id = $2 AND status NOT IN ('voided', 'returned') FOR UPDATE`,
          [storeId, preCheck.rows[0].id]
        );
        if (ordRes.rowCount) {
          const ord = ordRes.rows[0];
          matchedOrderId = ord.id;
          const balRes = await client.query(
            `SELECT
               COALESCE((SELECT SUM(amount_vnd) FROM payments WHERE store_id = $1 AND order_id = $2 AND status = 'succeeded'), 0)::text AS paid_vnd,
               COALESCE((SELECT SUM(refund_total_vnd) FROM returns WHERE store_id = $1 AND order_id = $2 AND status = 'completed'), 0)::text AS returned_vnd,
               COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.id = f.return_id WHERE f.store_id = $1 AND r.store_id = $1 AND r.order_id = $2 AND r.status = 'completed' AND f.status = 'succeeded'), 0)::text AS refunded_vnd`,
            [storeId, ord.id]
          );
          const remaining = BigInt(ord.total_vnd) - BigInt(balRes.rows[0].returned_vnd) - BigInt(balRes.rows[0].paid_vnd) + BigInt(balRes.rows[0].refunded_vnd);
          const incoming = BigInt(amountRaw);
          if (remaining <= 0n) {
            evtStatus = 'ignored';
            detail = `Đơn ${ord.order_number} đã thanh toán đủ trước đó.`;
          } else {
            const applyVnd = incoming > remaining ? remaining : incoming;
            const paymentId = randomUUID();
            const scopedRef = `${storeId}:${externalEventId}`;
            await client.query(
              `INSERT INTO payments (id, store_id, order_id, method, status, amount_vnd, provider, provider_reference, recorded_by)
               VALUES ($1, $2, $3, 'bank_qr', 'succeeded', $4, 'momo', $5, $6)`,
              [paymentId, storeId, ord.id, applyVnd.toString(), scopedRef, ownerUserId]
            );
            await insertCashMovement(client, {
              storeId,
              direction: 'in',
              category: 'Bán hàng (MoMo IPN)',
              amountVnd: applyVnd.toString(),
              method: 'bank_qr',
              sourceType: 'order_payment',
              sourceId: paymentId,
              note: `Tự động đối soát MoMo đơn ${ord.order_number}`,
              actorUserId: ownerUserId,
              counterpartyKind: ord.customer_id ? 'customer' : null,
              counterpartyId: ord.customer_id || null,
            });
            if (ord.customer_id) {
              const ordDebit = await client.query(
                `SELECT 1 FROM customer_ledger_entries WHERE store_id = $1 AND customer_id = $2 AND source_type = 'order' AND source_id = $3 LIMIT 1`,
                [storeId, ord.customer_id, ord.id]
              );
              if (ordDebit.rowCount) {
                await client.query(
                  `INSERT INTO customer_ledger_entries (store_id, customer_id, entry_type, credit_vnd, source_type, source_id, note, actor_user_id)
                   VALUES ($1, $2, 'payment_credit', $3, 'order_payment', $4, $5, $6)`,
                  [storeId, ord.customer_id, applyVnd.toString(), paymentId, `Webhook MOMO đơn ${ord.order_number}`, ownerUserId]
                );
              }
            }
            await client.query(
              `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
               VALUES ($1, $2, 'payment.webhook_reconciled', 'order', $3, $4,
                       jsonb_build_object('provider', 'momo', 'externalEventId', $5::text, 'amountVnd', $6::text))`,
              [storeId, ownerUserId, ord.id, `Webhook MoMo gạch nợ ${applyVnd.toString()} đ`, externalEventId, applyVnd.toString()]
            );
            evtStatus = 'processed';
            detail = `Đã gạch nợ MoMo ${applyVnd.toString()} đ cho đơn ${ord.order_number}`;
          }
        }
      }

      await client.query(
        `INSERT INTO integration_webhook_events (store_id, provider, external_event_id, payload_digest, matched_order_id, status, detail)
         VALUES ($1, 'momo', $2, $3, $4, $5, $6)`,
        [storeId, externalEventId, digest, matchedOrderId, evtStatus, detail]
      );
      await client.query('COMMIT');
      return reply.code(200).send({ ok: true, results: [{ externalEventId, status: evtStatus, matchedOrderId, detail }] });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  app.post('/api/webhooks/shipping/ghn/:storeId', async (request, reply) => {
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    if (!String(env.GHN_TOKEN || '').trim()) {
      throw new ApiError(503, 'integration_not_configured', 'Cổng Giao Hàng Nhanh chưa được gắn khóa GHN_TOKEN.');
    }
    const configuredSecret = String(env.GHN_WEBHOOK_SECRET || '').trim();
    if (configuredSecret) {
      const authHeader = String(request.headers['x-ghn-webhook-secret'] || request.headers['authorization'] || request.query?.token || '').replace(/^(Bearer|Apikey)\s+/i, '').trim();
      const a = Buffer.from(authHeader);
      const b = Buffer.from(configuredSecret);
      if (a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ApiError(401, 'invalid_webhook_signature', 'Khóa xác thực webhook GHN không hợp lệ.');
      }
    }
    const body = request.body || {};
    const configuredShopId = String(env.GHN_SHOP_ID || '').trim();
    const payloadShopId = String(body.ShopID ?? body.shop_id ?? '').trim();
    if (configuredShopId && payloadShopId && payloadShopId !== configuredShopId) {
      throw new ApiError(401, 'invalid_webhook_signature', 'ShopID trên webhook GHN không khớp với cửa hàng đã cấu hình.');
    }
    const orderCode = String(body.OrderCode || body.order_code || '').trim().slice(0, 64);
    const rawStatus = String(body.Status || body.status || '').trim().toLowerCase().slice(0, 40);
    if (!orderCode || !rawStatus || !/^[a-z0-9_-]{1,40}$/.test(rawStatus)) {
      throw new ApiError(400, 'validation_error', 'Thiếu hoặc sai định dạng mã vận đơn (OrderCode) / trạng thái (Status) từ GHN.');
    }
    const externalEventId = `ghn:${orderCode}:${rawStatus}:${String(body.Time || body.UpdatedDate || '')}`.slice(0, 190);
    const digest = createHash('sha256').update(JSON.stringify(body)).digest();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.store_id', $1, true)", [storeId]);
      const storeCheck = await client.query(
        `SELECT s.id,
                (SELECT m.user_id FROM memberships m WHERE m.store_id = s.id AND m.status = 'active' AND m.role = 'owner' ORDER BY m.joined_at, m.created_at LIMIT 1) AS owner_user_id
         FROM stores s WHERE s.id = $1 AND s.status = 'active'`,
        [storeId]
      );
      if (!storeCheck.rowCount) throw new ApiError(404, 'store_not_found', 'Không tìm thấy cửa hàng.');
      const ownerUserId = storeCheck.rows[0].owner_user_id;
      if (!ownerUserId) throw new ApiError(409, 'store_owner_missing', 'Không xác định được chủ cửa hàng.');
      await client.query("SELECT set_config('app.user_id', $1, true)", [ownerUserId]);

      const dup = await client.query(
        `SELECT id FROM integration_webhook_events WHERE store_id = $1 AND provider = 'ghn' AND external_event_id = $2`,
        [storeId, externalEventId]
      );
      if (dup.rowCount) {
        await client.query('COMMIT');
        return reply.code(200).send({ ok: true, status: 'duplicate' });
      }

      const rawTotalFee = Number(body.TotalFee ?? body.total_fee ?? 0);
      const boundedFee = Number.isFinite(rawTotalFee) ? Math.min(100_000_000, Math.max(0, Math.round(rawTotalFee))) : 0;
      const ordRes = await client.query(
        `UPDATE orders
         SET shipping_status = $3,
             shipping_fee_vnd = CASE WHEN $4::bigint > 0 THEN $4::bigint ELSE shipping_fee_vnd END,
             updated_at = now()
         WHERE store_id = $1 AND shipping_provider = 'ghn' AND shipping_tracking_code = $2
         RETURNING id, order_number`,
        [storeId, orderCode, rawStatus, boundedFee]
      );

      const matchedOrderId = ordRes.rowCount ? ordRes.rows[0].id : null;
      const evtStatus = ordRes.rowCount ? 'processed' : 'ignored';
      const detail = ordRes.rowCount
        ? `GHN cập nhật vận đơn ${orderCode} (${ordRes.rows[0].order_number}) sang trạng thái ${rawStatus}`
        : `Không tìm thấy đơn hàng có mã vận đơn GHN ${orderCode}`;

      if (ordRes.rowCount) {
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason, metadata)
           VALUES ($1, $2, 'order.shipping_status_updated', 'order', $3, $4,
                   jsonb_build_object('provider', 'ghn', 'trackingCode', $5::text, 'shippingStatus', $6::text))`,
          [storeId, ownerUserId, matchedOrderId, detail, orderCode, rawStatus]
        );
      }
      await client.query(
        `INSERT INTO integration_webhook_events (store_id, provider, external_event_id, payload_digest, matched_order_id, status, detail)
         VALUES ($1, 'ghn', $2, $3, $4, $5, $6)`,
        [storeId, externalEventId, digest, matchedOrderId, evtStatus, detail]
      );
      await client.query('COMMIT');
      return reply.code(200).send({ ok: true, status: evtStatus, matchedOrderId, shippingStatus: rawStatus });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
}

module.exports = { registerIntegrationRoutes, validateSettingsInput };
