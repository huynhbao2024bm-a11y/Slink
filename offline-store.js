(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SlinkOfflineStore = factory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOfflineStore(options) {
  'use strict';
  const config = options || {};
  const factory = config.indexedDB || globalThis.indexedDB;
  const databaseName = config.name || 'slink-offline-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  let databasePromise;

  function scopeKey(userId, storeId) {
    if (!userId || !storeId) throw new Error('Thiếu tài khoản hoặc cửa hàng cho dữ liệu trên máy.');
    return encodeURIComponent(userId) + '|' + encodeURIComponent(storeId);
  }

  function storageError(error) {
    const issue = new Error(error?.name === 'QuotaExceededError'
      ? 'Máy không còn đủ chỗ lưu. Chưa ghi nhận thao tác; hãy kết nối mạng và đồng bộ trước.'
      : 'Chưa lưu được trên thiết bị. Giữ màn hình này và thử lại; thao tác chưa được ghi nhận.');
    issue.code = 'offline_storage_unavailable';
    return issue;
  }

  function open() {
    if (!factory) return Promise.reject(storageError());
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      let blocked = false;
      const request = factory.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('meta', { keyPath: 'key' });
        db.createObjectStore('cache', { keyPath: 'key' }).createIndex('scope', 'scope');
        db.createObjectStore('outbox', { keyPath: 'id' }).createIndex('scope', 'scope');
      };
      request.onerror = () => { databasePromise = null; reject(storageError(request.error)); };
      request.onblocked = () => { blocked = true; databasePromise = null; reject(new Error('Đóng các tab Slink cũ rồi mở lại để chuẩn bị lưu trên máy.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => { db.close(); databasePromise = null; };
        resolve(db);
      };
    });
    return databasePromise;
  }

  async function transaction(names, mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let tx;
      try { tx = db.transaction(names, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined); }
      catch (_) { try { tx = db.transaction(names, mode); } catch (error) { reject(storageError(error)); return; } }
      let result, failure;
      const fail = error => { failure = ['QuotaExceededError', 'UnknownError', 'InvalidStateError', 'NotAllowedError'].includes(error?.name) ? storageError(error) : error; try { tx.abort(); } catch (_) { reject(error); } };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure || storageError(tx.error));
      tx.onerror = () => { /* onabort is the single rejection path. */ };
      try { work(tx, value => { result = value; }, fail); }
      catch (error) { fail(error); }
    });
  }

  function getMeta(key) {
    return transaction(['meta'], 'readonly', (tx, done) => {
      const request = tx.objectStore('meta').get(key);
      request.onsuccess = () => done(request.result?.value);
    });
  }

  function putMeta(key, value) {
    return transaction(['meta'], 'readwrite', tx => tx.objectStore('meta').put({ key, value: copy(value) }));
  }

  function removeMeta(key) {
    return transaction(['meta'], 'readwrite', tx => tx.objectStore('meta').delete(key));
  }

  function cacheResponse(scope, url, value, fetchedAt, expectedEpoch) {
    if (!scope || !url.startsWith('/api/')) return Promise.reject(new Error('Nguồn dữ liệu lưu trên máy không hợp lệ.'));
    return transaction(['cache', 'meta', 'outbox'], 'readwrite', (tx, done) => {
      const epoch = tx.objectStore('meta').get('epoch|' + scope);
      epoch.onsuccess = () => {
        if (expectedEpoch !== undefined && (epoch.result?.value || '') !== expectedEpoch) { done(false); return; }
        const pending = tx.objectStore('outbox').index('scope').getAll(scope);
        pending.onsuccess = () => {
          if (pending.result.some(row => row.state !== 'acknowledged')) { done(false); return; }
          tx.objectStore('cache').put({ key: scope + '|' + url, scope, url, fetchedAt: fetchedAt || new Date().toISOString(), value: copy(value) }); done(true);
        };
      };
    });
  }

  function cachedResponse(scope, url) {
    return transaction(['cache'], 'readonly', (tx, done) => {
      const request = tx.objectStore('cache').get(scope + '|' + url);
      request.onsuccess = () => done(request.result);
    });
  }

  function responses(scope) {
    return transaction(['cache'], 'readonly', (tx, done) => {
      const request = tx.objectStore('cache').index('scope').getAll(scope);
      request.onsuccess = () => done(request.result);
    });
  }

  function clearResponses(scope) {
    return transaction(['cache', 'meta'], 'readwrite', tx => {
      const store = tx.objectStore('cache'), keys = store.index('scope').getAllKeys(scope);
      keys.onsuccess = () => keys.result.forEach(key => store.delete(key));
      tx.objectStore('meta').put({ key: 'epoch|' + scope, value: 'clear:' + Date.now() });
    });
  }

  async function lookup(scope, url, snapshotValue) {
    const exact = snapshotValue ? snapshotValue.responses.find(row => row.url === url) : await cachedResponse(scope, url);
    if (exact && !/\/(products|inventory|customers|orders)$/.test(new URL(url, 'https://offline.invalid').pathname)) return exact;
    const query = new URL(url, 'https://offline.invalid');
    const resource = query.pathname.split('/').pop();
    const collection = { products: 'products', inventory: 'products', customers: 'customers', orders: 'orders' }[resource];
    if (!collection) return null;
    const allowed = new Set(['q', 'offset', 'limit', 'view', 'warehouseId', 'status']);
    if (resource === 'customers') allowed.add('tag');
    if (resource === 'inventory') allowed.add('stock');
    if (Array.from(query.searchParams.keys()).some(key => !allowed.has(key))) return null;
    const inventoryFilter = resource === 'inventory' ? query.searchParams.get('stock') : null;
    const filterStock = inventoryFilter === 'low' || inventoryFilter === 'out';
    const candidates = (snapshotValue ? snapshotValue.responses : await responses(scope)).filter(record => {
      const saved = new URL(record.url, 'https://offline.invalid');
      return (saved.pathname === query.pathname || (resource === 'inventory' && saved.pathname === query.pathname.replace(/inventory$/, 'products')))
        && (!saved.searchParams.get('q') || (filterStock && saved.searchParams.get('q') === query.searchParams.get('q')))
        && Array.from(saved.searchParams.keys()).every(key => ['q', 'offset', 'limit', 'view', 'warehouseId', 'status'].includes(key) || (filterStock && key === 'stock'))
        && (!saved.searchParams.get('status') || saved.searchParams.get('status') === 'all')
        && (saved.searchParams.get('warehouseId') || '') === (query.searchParams.get('warehouseId') || '')
        && ((saved.searchParams.get('view') || '') === (query.searchParams.get('view') || '') || (!saved.searchParams.get('view') && query.searchParams.get('view') === 'picker'));
    }).sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt));
    if (!candidates.length) return exact || null;
    const term = (query.searchParams.get('q') || '').trim();
    if (exact && term && !filterStock && ['products', 'inventory'].includes(resource)) {
      const newer = new Map();
      candidates.filter(record => record.fetchedAt > exact.fetchedAt).forEach(record => {
        (record.value[collection] || []).forEach(row => newer.set(row.id, { ...newer.get(row.id), ...row }));
      });
      return { ...exact, value: { ...exact.value, [collection]: (exact.value[collection] || []).map(row => ({ ...row, ...newer.get(row.id) })) } };
    }
    const rows = new Map();
    candidates.forEach(record => (record.value[collection] || []).forEach(row => rows.set(row.id, { ...rows.get(row.id), ...row })));
    const text = term.toLocaleLowerCase('vi-VN');
    const tag = query.searchParams.get('tag');
    const status = query.searchParams.get('status');
    let filtered = Array.from(rows.values()).filter(row => {
      const words = [row.name, row.sku, row.category, row.variant_group_name, ...Object.entries(row.variant_attributes || {}).map(([key, value]) => key + ' ' + value), row.phone, row.email, row.order_number, row.customer_name, row.customer_phone].filter(Boolean).join(' ').toLocaleLowerCase('vi-VN');
      const due = Number(row.total_vnd || 0) - Number(row.paid_vnd || 0) - Number(row.return_total_vnd || 0) + Number(row.refunded_vnd || 0);
      const statusMatch = !status || status === 'all' || (status === 'due' ? row.status === 'completed' && due > 0 : status === 'completed' ? row.status === status && due <= 0 : row.status === status);
      return (!text || words.includes(text) || row.barcode === term) && (!tag || row.tags?.includes(tag)) && statusMatch;
    });
    if (resource === 'inventory') filtered = filtered.filter(row => row.inventory_tracked);
    const offset = Math.max(0, Number(query.searchParams.get('offset')) || 0);
    const limit = Math.max(1, Math.min(100, Number(query.searchParams.get('limit')) || 100));
    const latest = candidates.filter(row => new URL(row.url, 'https://offline.invalid').pathname === query.pathname).slice(-1)[0] || candidates[candidates.length - 1];
    if (filterStock) {
      // Project pending stock changes before matching and paging, including rows that enter the filter.
      filtered.sort((a, b) => a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id));
      return { ...latest, url, value: { ...copy(latest.value), products: filtered, offlineCachedCount: rows.size, offlineStockCandidates: true } };
    }
    return { ...latest, url, value: { ...copy(latest.value), [collection]: filtered.slice(offset, offset + limit), total: filtered.length, nextOffset: offset + limit < filtered.length ? offset + limit : null, offlineCachedCount: rows.size } };
  }

  function operations(scope) {
    return transaction(['outbox'], 'readonly', (tx, done) => {
      const request = tx.objectStore('outbox').index('scope').getAll(scope);
      request.onsuccess = () => done(request.result.sort((a, b) => a.sequence - b.sequence));
    });
  }

  function enqueue(input) {
    const value = copy(input);
    const scope = scopeKey(value.userId, value.storeId);
    if (!['sale', 'purchase', 'stock-count', 'cash', 'shift-open', 'shift-close'].includes(value.kind)
      || typeof value.key !== 'string' || value.key.length < 16 || value.key.length > 200
      || !value.url?.startsWith('/api/stores/' + encodeURIComponent(value.storeId) + '/')
      || !value.payload || typeof value.payload !== 'object') {
      return Promise.reject(new Error('Thao tác chờ chưa hợp lệ, chưa được lưu.'));
    }
    const id = scope + '|' + value.key;
    return transaction(['meta', 'outbox', 'cache'], 'readwrite', (tx, done, fail) => {
      const box = tx.objectStore('outbox'), meta = tx.objectStore('meta');
      const existing = box.get(id);
      existing.onsuccess = () => {
        if (existing.result) {
          const saved = existing.result;
          if (saved.kind !== value.kind || saved.url !== value.url || JSON.stringify(saved.payload) !== JSON.stringify(value.payload)) {
            fail(new Error('Mã thao tác đã được dùng cho nội dung khác. Không tạo thêm bản ghi.')); return;
          }
          done(saved); return;
        }
        const counterKey = 'sequence|' + scope;
        const counter = meta.get(counterKey);
        counter.onsuccess = () => {
          const sequence = (counter.result?.value || 0) + 1;
          const record = { ...value, id, scope, sequence, state: 'ready', attempts: 0, queuedAt: new Date().toISOString() };
          const commit = () => { meta.put({ key: counterKey, value: sequence }); meta.put({ key: 'epoch|' + scope, value: 'queued:' + record.id }); box.add(record); done(record); };
          if (!config.validateEnqueue) { commit(); return; }
          const parts = {}; let left = 4;
          const collect = (name, request) => { request.onsuccess = () => {
            parts[name] = request.result;
            if (--left) return;
            try {
              if (parts.active?.value !== value.userId) throw new Error('Tài khoản trên thiết bị đã đổi. Đăng nhập đúng tài khoản để tiếp tục.');
              config.validateEnqueue(parts.cache, parts.operations, record, parts.session?.value);
              commit();
            } catch (error) { fail(error); }
          }; };
          collect('cache', tx.objectStore('cache').index('scope').getAll(scope));
          collect('operations', box.index('scope').getAll(scope));
          collect('session', meta.get('session|' + value.userId));
          collect('active', meta.get('active-user'));
        };
      };
    });
  }

  // The lease and the first unsettled operation are selected in one IDB transaction.
  // If a tab dies after server commit, its successor retries the same immutable key.
  function claim(scope, owner, now) {
    const time = now ?? Date.now();
    return transaction(['meta', 'outbox'], 'readwrite', (tx, done) => {
      const meta = tx.objectStore('meta'), box = tx.objectStore('outbox');
      const key = 'lease|' + scope, lease = meta.get(key);
      lease.onsuccess = () => {
        if (lease.result?.value.owner !== owner && lease.result?.value.until > time) { done(null); return; }
        const rows = box.index('scope').getAll(scope);
        rows.onsuccess = () => {
          const sorted = rows.result.filter(row => row.state !== 'acknowledged').sort((a, b) => a.sequence - b.sequence);
          const confirmed = sorted.filter(row => row.state === 'confirmed');
          const first = sorted.find(row => row.state !== 'confirmed');
          if (!first || first.state === 'conflict') {
            if (confirmed.length) meta.put({ key, value: { owner, operationId: confirmed[0].id, until: time + 60000 } });
            done(first ? { blocked: true, operation: first, hasConfirmed: Boolean(confirmed.length) } : confirmed.length ? { confirmedOnly: true } : null); return;
          }
          const record = { ...first, state: 'sending', attempts: first.attempts + 1 };
          meta.put({ key, value: { owner, operationId: record.id, until: time + 60000 } });
          box.put(record); done({ operation: record });
        };
      };
    });
  }

  function settle(scope, owner, id, outcome) {
    return transaction(['meta', 'outbox'], 'readwrite', (tx, done, fail) => {
      const meta = tx.objectStore('meta'), box = tx.objectStore('outbox');
      const lease = meta.get('lease|' + scope);
      lease.onsuccess = () => {
        if (lease.result?.value.owner !== owner || lease.result.value.operationId !== id) { fail(new Error('Một tab khác đang đồng bộ. Bản ghi vẫn được giữ.')); return; }
        const request = box.get(id);
        request.onsuccess = () => {
          const saved = request.result;
          if (!saved || saved.scope !== scope) { fail(new Error('Không tìm thấy thao tác trong cửa hàng này.')); return; }
          if (!['ready', 'conflict'].includes(outcome.state)) { fail(new Error('Chỉ xác nhận đã đồng bộ cùng lúc với dữ liệu đối chiếu.')); return; }
          const record = { ...saved, state: outcome.state, result: outcome.result ? copy(outcome.result) : null, issue: outcome.issue || null };
          box.put(record); meta.delete('lease|' + scope); done(record);
        };
      };
    });
  }

  function confirm(scope, owner, id, result) {
    return transaction(['meta', 'outbox'], 'readwrite', (tx, done, fail) => {
      const meta = tx.objectStore('meta'), box = tx.objectStore('outbox'), lease = meta.get('lease|' + scope);
      lease.onsuccess = () => {
        if (lease.result?.value.owner !== owner || lease.result.value.operationId !== id) { fail(new Error('Một tab khác đang đồng bộ; giữ nguyên mã để kiểm tra lại.')); return; }
        const request = box.get(id);
        request.onsuccess = () => {
          if (!request.result || request.result.scope !== scope) { fail(new Error('Không tìm thấy chứng từ chờ.')); return; }
          const record = { ...request.result, state: 'confirmed', result: copy(result), issue: null };
          box.put(record); done(record);
        };
      };
    });
  }

  function renew(scope, owner) {
    return transaction(['meta'], 'readwrite', (tx, done) => {
      const meta = tx.objectStore('meta'), key = 'lease|' + scope, request = meta.get(key);
      request.onsuccess = () => {
        if (request.result?.value.owner !== owner) { done(false); return; }
        meta.put({ key, value: { ...request.result.value, until: Date.now() + 60000 } }); done(true);
      };
    });
  }

  function prepareDelivery(scope, owner, id, delivery) {
    return transaction(['meta', 'outbox'], 'readwrite', (tx, done, fail) => {
      const meta = tx.objectStore('meta'), box = tx.objectStore('outbox');
      const lease = meta.get('lease|' + scope);
      lease.onsuccess = () => {
        if (lease.result?.value.owner !== owner || lease.result.value.operationId !== id) { fail(new Error('Một tab khác đang đồng bộ.')); return; }
        const request = box.get(id);
        request.onsuccess = () => {
          const saved = request.result;
          if (!saved || saved.scope !== scope) { fail(new Error('Không tìm thấy chứng từ chờ.')); return; }
          if (saved.delivery) { done(saved.delivery); return; }
          const value = copy(delivery);
          if (!value.url.startsWith('/api/stores/' + encodeURIComponent(saved.storeId) + '/') || !value.payload) { fail(new Error('Địa chỉ đồng bộ chưa hợp lệ.')); return; }
          box.put({ ...saved, delivery: value }); done(value);
        };
      };
    });
  }

  function acknowledge(scope, owner, id, result, freshResponses) {
    return transaction(['meta', 'outbox', 'cache'], 'readwrite', (tx, done, fail) => {
      const meta = tx.objectStore('meta'), box = tx.objectStore('outbox'), cache = tx.objectStore('cache');
      const lease = meta.get('lease|' + scope);
      lease.onsuccess = () => {
        if (lease.result?.value.owner !== owner || lease.result.value.operationId !== id) { fail(new Error('Một tab khác đang đồng bộ; chứng từ vẫn được giữ.')); return; }
        const request = box.get(id);
        request.onsuccess = () => {
          const saved = request.result;
          if (!saved || saved.scope !== scope || !Array.isArray(freshResponses) || !freshResponses.length) { fail(new Error('Chưa tải đủ dữ liệu để đối chiếu chứng từ đã gửi.')); return; }
          const paths = new Set(freshResponses.map(row => new URL(row.url, 'https://offline.invalid').pathname));
          const known = cache.index('scope').getAll(scope);
          known.onsuccess = () => {
            known.result.forEach(row => { if (paths.has(new URL(row.url, 'https://offline.invalid').pathname)) cache.delete(row.key); });
            for (const row of freshResponses) cache.put({ key: scope + '|' + row.url, scope, url: row.url, fetchedAt: row.fetchedAt || new Date().toISOString(), value: copy(row.value) });
            const record = { ...saved, state: 'acknowledged', result: copy(result), issue: null, acknowledgedAt: new Date().toISOString() };
            box.put(record); meta.put({ key: 'epoch|' + scope, value: 'ack:' + id }); meta.delete('lease|' + scope); done(record);
          };
        };
      };
    });
  }

  function acknowledgeConfirmed(scope, owner, freshResponses) {
    return transaction(['meta', 'outbox', 'cache'], 'readwrite', (tx, done, fail) => {
      const meta = tx.objectStore('meta'), box = tx.objectStore('outbox'), cache = tx.objectStore('cache'), lease = meta.get('lease|' + scope);
      lease.onsuccess = () => {
        if (lease.result?.value.owner !== owner) { fail(new Error('Một tab khác đang đồng bộ; chứng từ vẫn được giữ.')); return; }
        const request = box.index('scope').getAll(scope);
        request.onsuccess = () => {
          const prefix = request.result.filter(row => row.state !== 'acknowledged').sort((a, b) => a.sequence - b.sequence);
          const confirmed = [];
          for (const row of prefix) { if (row.state !== 'confirmed') break; confirmed.push(row); }
          if (!confirmed.length || !freshResponses?.length) { fail(new Error('Chưa đủ dữ liệu đối chiếu để xác nhận đồng bộ.')); return; }
          if (freshResponses.some(row => !row.url.startsWith('/api/stores/' + encodeURIComponent(confirmed[0].storeId) + '/'))) { fail(new Error('Dữ liệu đối chiếu khác cửa hàng.')); return; }
          const paths = new Set(freshResponses.map(row => new URL(row.url, 'https://offline.invalid').pathname)), known = cache.index('scope').getAll(scope);
          known.onsuccess = () => {
            known.result.forEach(row => { if (paths.has(new URL(row.url, 'https://offline.invalid').pathname)) cache.delete(row.key); });
            freshResponses.forEach(row => cache.put({ key: scope + '|' + row.url, scope, url: row.url, fetchedAt: row.fetchedAt || new Date().toISOString(), value: copy(row.value) }));
            confirmed.forEach(row => box.put({ ...row, state: 'acknowledged', acknowledgedAt: new Date().toISOString() }));
            meta.put({ key: 'epoch|' + scope, value: 'ack:' + confirmed[confirmed.length - 1].id }); meta.delete('lease|' + scope); done(confirmed);
          };
        };
      };
    });
  }

  function replaceResponses(scope, freshResponses, expectedEpoch) {
    return transaction(['meta', 'cache', 'outbox'], 'readwrite', (tx, done, fail) => {
      const meta = tx.objectStore('meta'), cache = tx.objectStore('cache'), epoch = meta.get('epoch|' + scope);
      epoch.onsuccess = () => {
        if ((epoch.result?.value || '') !== expectedEpoch) { done(false); return; }
        const pending = tx.objectStore('outbox').index('scope').getAll(scope);
        pending.onsuccess = () => {
          if (pending.result.some(row => row.state !== 'acknowledged')) { done(false); return; }
          if (!freshResponses.length || freshResponses.some(row => !row.url.startsWith('/api/'))) { fail(new Error('Dữ liệu chuẩn bị chưa hợp lệ.')); return; }
          const paths = new Set(freshResponses.map(row => new URL(row.url, 'https://offline.invalid').pathname)), known = cache.index('scope').getAll(scope);
          known.onsuccess = () => {
            known.result.forEach(row => { if (paths.has(new URL(row.url, 'https://offline.invalid').pathname)) cache.delete(row.key); });
            freshResponses.forEach(row => cache.put({ key: scope + '|' + row.url, scope, url: row.url, fetchedAt: row.fetchedAt || new Date().toISOString(), value: copy(row.value) }));
            const time = new Date().toISOString(); meta.put({ key: 'prepared|' + scope, value: time }); meta.put({ key: 'epoch|' + scope, value: 'warm:' + time }); done(true);
          };
        };
      };
    });
  }

  function snapshot(scope) {
    return transaction(['meta', 'cache', 'outbox'], 'readonly', (tx, done) => {
      const result = {}; let left = 3;
      for (const [name, request] of [['epoch', tx.objectStore('meta').get('epoch|' + scope)], ['responses', tx.objectStore('cache').index('scope').getAll(scope)], ['operations', tx.objectStore('outbox').index('scope').getAll(scope)]]) {
        request.onsuccess = () => { result[name] = name === 'epoch' ? (request.result?.value || '') : request.result; if (!--left) { result.operations.sort((a, b) => a.sequence - b.sequence); done(result); } };
      }
    });
  }

  function release(scope, owner) {
    return transaction(['meta'], 'readwrite', tx => {
      const meta = tx.objectStore('meta'), request = meta.get('lease|' + scope);
      request.onsuccess = () => { if (request.result?.value.owner === owner) meta.delete('lease|' + scope); };
    });
  }

  function retry(scope, id) {
    return transaction(['outbox', 'meta'], 'readwrite', (tx, done, fail) => {
      const box = tx.objectStore('outbox'), request = box.get(id);
      request.onsuccess = () => {
        const saved = request.result;
        if (!saved || saved.scope !== scope || saved.state !== 'conflict') { fail(new Error('Chứng từ này không ở trạng thái cần thử lại.')); return; }
        const record = { ...saved, state: 'ready', issue: null }; box.put(record); done(record);
      };
    });
  }

  async function requestPersistence() {
    try { return Boolean(await globalThis.navigator?.storage?.persist?.()); }
    catch (_) { return false; }
  }

  async function close() { const db = await open(); db.close(); databasePromise = null; }
  return { open, close, scopeKey, getMeta, putMeta, removeMeta, cacheResponse, cachedResponse, responses, clearResponses, lookup, operations, enqueue, claim, settle, confirm, renew, prepareDelivery, acknowledge, acknowledgeConfirmed, replaceResponses, snapshot, release, retry, requestPersistence };
});
