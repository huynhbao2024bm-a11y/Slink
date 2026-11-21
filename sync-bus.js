(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.SlinkSyncBus = factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  var CHANNEL_NAME = 'slink-sync-bus-v1';
  var DOMAINS = {
    DASHBOARD: 'dashboard',
    ORDERS: 'orders',
    PRODUCTS: 'products',
    STOCK: 'stock',
    CUSTOMERS: 'customers',
    CASHBOOK: 'cashbook',
    DEBTS: 'debts',
    SUPPLIERS: 'suppliers',
    SETTINGS: 'settings',
    STAFF: 'staff',
    ME: 'me',
    REPORTS: 'reports',
    CHANNELS: 'channels',
    INTEGRATIONS: 'integrations',
  };

  function generateTabId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'tab_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
  }

  function normalizeDomains(domains) {
    var list = Array.isArray(domains) ? domains : [domains];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var d = String(list[i] || '').trim().toLowerCase();
      if (!d || seen[d]) continue;
      seen[d] = true;
      out.push(d);
    }
    return out;
  }

  function createSyncBus(options) {
    var opts = options || {};
    var batchMs = typeof opts.batchMs === 'number' && opts.batchMs >= 0 ? opts.batchMs : 60;
    var tabId = String(opts.tabId || generateTabId());
    var origin = String(
      opts.origin ||
      (root && root.location && root.location.origin ? root.location.origin : 'local')
    );

    var context = {
      storeId: opts.storeId != null ? String(opts.storeId) : '',
      userId: opts.userId != null ? String(opts.userId) : '',
      origin: origin,
    };

    var listeners = Object.create(null);
    var invalidateHandlers = [];
    var pendingDomains = Object.create(null);
    var pendingMeta = {};
    var flushTimer = null;
    var destroyed = false;

    var ChannelCtor = opts.BroadcastChannelImpl || (root && root.BroadcastChannel) || null;
    var channel = null;

    function handleIncomingMessage(ev) {
      if (destroyed) return;
      var msg = ev && ev.data ? ev.data : ev;
      if (!msg || typeof msg !== 'object') return;
      if (msg.tabId === tabId) return;
      if (String(msg.origin || '') !== context.origin) return;
      if (!context.storeId || String(msg.storeId || '') !== context.storeId) return;
      if (!context.userId || String(msg.userId || '') !== context.userId) return;
      var domains = normalizeDomains(msg.domains);
      if (!domains.length) return;
      emitInternal(domains, Object.assign({}, msg.meta || {}, { remote: true }), false);
    }

    if (typeof ChannelCtor === 'function') {
      try {
        channel = new ChannelCtor(CHANNEL_NAME);
        if (channel) {
          if (typeof channel.addEventListener === 'function') {
            channel.addEventListener('message', handleIncomingMessage);
          } else {
            channel.onmessage = handleIncomingMessage;
          }
        }
      } catch (_) {
        channel = null;
      }
    }

    function setContext(next) {
      var info = next || {};
      if (info.storeId !== undefined) context.storeId = info.storeId == null ? '' : String(info.storeId);
      if (info.userId !== undefined) context.userId = info.userId == null ? '' : String(info.userId);
      if (info.origin !== undefined && info.origin) context.origin = String(info.origin);
    }

    function getContext() {
      return {
        storeId: context.storeId,
        userId: context.userId,
        origin: context.origin,
        tabId: tabId,
      };
    }

    function on(domain, handler) {
      if (typeof handler !== 'function') return function () {};
      var key = String(domain || '*').trim().toLowerCase() || '*';
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(handler);
      return function () {
        off(key, handler);
      };
    }

    function off(domain, handler) {
      var key = String(domain || '*').trim().toLowerCase() || '*';
      var arr = listeners[key];
      if (!arr) return;
      listeners[key] = arr.filter(function (fn) { return fn !== handler; });
    }

    function onInvalidate(handler) {
      if (typeof handler !== 'function') return function () {};
      invalidateHandlers.push(handler);
      return function () {
        invalidateHandlers = invalidateHandlers.filter(function (fn) { return fn !== handler; });
      };
    }

    function flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      var domains = Object.keys(pendingDomains);
      if (!domains.length) return;
      var meta = Object.assign({}, pendingMeta);
      pendingDomains = Object.create(null);
      pendingMeta = {};

      var domainSet = Object.create(null);
      for (var i = 0; i < domains.length; i++) {
        domainSet[domains[i]] = true;
      }

      var payload = {
        domains: domains,
        domainSet: domainSet,
        meta: meta,
        context: getContext(),
      };

      var invoked = [];
      for (var j = 0; j < domains.length; j++) {
        var bucket = listeners[domains[j]] || [];
        for (var k = 0; k < bucket.length; k++) {
          if (invoked.indexOf(bucket[k]) === -1) invoked.push(bucket[k]);
        }
      }
      var wildcard = listeners['*'] || [];
      for (var w = 0; w < wildcard.length; w++) {
        if (invoked.indexOf(wildcard[w]) === -1) invoked.push(wildcard[w]);
      }

      for (var idx = 0; idx < invoked.length; idx++) {
        try {
          invoked[idx](payload);
        } catch (_) {}
      }
    }

    function emitInternal(domains, meta, shouldBroadcast) {
      if (destroyed) return;
      var list = normalizeDomains(domains);
      if (!list.length) return;
      var safeMeta = meta && typeof meta === 'object' ? meta : {};

      // Synchronous cache invalidation immediately before coalesced refresh
      for (var i = 0; i < invalidateHandlers.length; i++) {
        try {
          invalidateHandlers[i](list, safeMeta);
        } catch (_) {}
      }

      for (var j = 0; j < list.length; j++) {
        pendingDomains[list[j]] = true;
      }
      Object.assign(pendingMeta, safeMeta);

      if (shouldBroadcast && channel && context.storeId && context.userId) {
        try {
          channel.postMessage({
            tabId: tabId,
            origin: context.origin,
            storeId: context.storeId,
            userId: context.userId,
            domains: list,
            meta: safeMeta,
            ts: Date.now(),
          });
        } catch (_) {}
      }

      if (batchMs === 0) {
        flush();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, batchMs);
      }
    }

    function emit(domains, meta) {
      emitInternal(domains, meta, true);
    }

    function destroy() {
      destroyed = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      pendingDomains = Object.create(null);
      listeners = Object.create(null);
      invalidateHandlers = [];
      if (channel && typeof channel.close === 'function') {
        try {
          channel.close();
        } catch (_) {}
      }
      channel = null;
    }

    return {
      setContext: setContext,
      getContext: getContext,
      on: on,
      off: off,
      onInvalidate: onInvalidate,
      emit: emit,
      flush: flush,
      destroy: destroy,
    };
  }

  var defaultBus = null;
  function getDefaultBus() {
    if (!defaultBus) {
      defaultBus = createSyncBus({ batchMs: 60 });
    }
    return defaultBus;
  }

  return {
    CHANNEL_NAME: CHANNEL_NAME,
    DOMAINS: DOMAINS,
    createSyncBus: createSyncBus,
    getDefaultBus: getDefaultBus,
    setContext: function (next) { return getDefaultBus().setContext(next); },
    getContext: function () { return getDefaultBus().getContext(); },
    on: function (domain, fn) { return getDefaultBus().on(domain, fn); },
    off: function (domain, fn) { return getDefaultBus().off(domain, fn); },
    onInvalidate: function (fn) { return getDefaultBus().onInvalidate(fn); },
    emit: function (domains, meta) { return getDefaultBus().emit(domains, meta); },
    flush: function () { return getDefaultBus().flush(); },
  };
});
