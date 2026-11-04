(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.SlinkOfflineSync = factory;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOfflineSync(config) {
  'use strict';
  const disk = config.disk, scope = config.scope, owner = config.owner;
  let current = null, stopped = false, retryTimer = null, failures = 0;
  const online = config.online || (() => typeof navigator === 'undefined' || navigator.onLine);
  const notify = event => config.onChange?.(event);

  async function deliveryFor(operation) {
    if (operation.delivery) return operation.delivery;
    const payload = JSON.parse(JSON.stringify(operation.payload));
    let url = operation.url;
    const localSession = payload.offline?.cashSessionId;
    if (localSession?.startsWith('local:')) {
      const key = localSession.slice(6), rows = await disk.operations(scope);
      const opened = rows.find(row => row.key === key && ['confirmed', 'acknowledged'].includes(row.state));
      const id = opened?.result?.session?.id;
      if (!id) { const error = new Error('Ca mở trên thiết bị chưa được máy chủ xác nhận. Chứng từ vẫn được giữ.'); error.code = 'offline_dependency_missing'; error.status = 409; throw error; }
      payload.offline.cashSessionId = id;
      if (operation.kind === 'shift-close') url = url.replace(encodeURIComponent(localSession), encodeURIComponent(id));
    }
    return disk.prepareDelivery(scope, owner, operation.id, { url, payload });
  }

  function schedule() {
    if (stopped || retryTimer || !online()) return;
    const delay = Math.min(60000, 1000 * 2 ** Math.min(failures, 6));
    retryTimer = setTimeout(() => { retryTimer = null; flush(); }, delay);
  }

  async function finalize() {
    const rows = await disk.operations(scope);
    const confirmed = rows.filter(row => row.state === 'confirmed');
    if (!confirmed.length) return 0;
    // Reacquire after a failed request released its lease; ready operations may
    // be marked sending but are not transmitted until this cache fence commits.
    const claim = await disk.claim(scope, owner);
    if (!claim) return 0;
    const fresh = await config.refresh(confirmed);
    const acknowledged = await disk.acknowledgeConfirmed(scope, owner, fresh);
    notify({ type: 'acknowledged', operations: acknowledged });
    return acknowledged.length;
  }

  async function run() {
    if (stopped || !online()) return { pending: true };
    if (!(await disk.operations(scope)).some(row => row.state !== 'acknowledged')) return { pending: false };
    const identity = await config.authenticate();
    if (stopped || !online()) return { pending: true };
    if (identity.user.id !== config.userId || !identity.stores.some(row => row.id === config.storeId)) {
      const error = new Error('Cần đăng nhập đúng tài khoản còn quyền vào cửa hàng để đồng bộ.'); error.status = 403; error.code = 'offline_identity_changed'; throw error;
    }
    let sent = 0, synced = 0, blocked = false, lastError = null;
    const heartbeat = setInterval(() => { disk.renew(scope, owner).catch(error => notify({ type: 'issue', message: error.message })); }, 20000);
    try {
      while (!stopped && online()) {
        const claim = await disk.claim(scope, owner);
        if (!claim) break;
        if (claim.confirmedOnly) { synced += await finalize(); break; }
        if (claim.blocked) { blocked = true; if (claim.hasConfirmed) synced += await finalize(); break; }
        const operation = claim.operation;
        try {
          const delivery = await deliveryFor(operation);
          const result = await config.send(delivery.url, { method: 'POST', headers: { 'idempotency-key': operation.key }, body: delivery.payload });
          await disk.confirm(scope, owner, operation.id, result);
          notify({ type: 'confirmed', key: operation.key }); sent += 1;
        } catch (error) {
          const conflict = error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status) && error.code !== 'request_in_progress';
          await disk.settle(scope, owner, operation.id, { state: conflict ? 'conflict' : 'ready', issue: { code: error.code || 'connection_lost', message: error.message } });
          notify({ type: conflict ? 'conflict' : 'issue', key: operation.key, code: error.code, message: error.message });
          blocked = conflict; lastError = error;
          if (online()) synced += await finalize();
          break;
        }
        if (sent % (config.batchSize || 12) === 0) synced += await finalize();
      }
      if (online()) synced += await finalize();
      failures = lastError ? failures + 1 : 0;
      if (!blocked && lastError?.status !== 401 && (await disk.operations(scope)).some(row => row.state !== 'acknowledged')) schedule();
      return { sent, synced, blocked, pending: (await disk.operations(scope)).some(row => row.state !== 'acknowledged') };
    } finally { clearInterval(heartbeat); await disk.release(scope, owner); }
  }

  function flush() {
    if (current) return current;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    current = run().catch(error => {
      failures += 1; notify({ type: 'issue', code: error.code, message: error.message, status: error.status });
      if (![401, 403].includes(error.status)) schedule();
      return { pending: true, error };
    }).finally(() => { current = null; });
    return current;
  }

  function close() { stopped = true; if (retryTimer) clearTimeout(retryTimer); retryTimer = null; }
  return { flush, close, deliveryFor };
});
