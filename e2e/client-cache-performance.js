'use strict';

const assert = require('node:assert/strict');
const { bootTempApp, registerOwnerInBrowser, loadPlaywright, launchBrowser } = require('./commercial-responsive');

async function run() {
  const app = await bootTempApp();
  const browser = await launchBrowser(loadPlaywright().chromium);
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await registerOwnerInBrowser(page, app.origin);
    await page.waitForTimeout(3700);
    const result = await page.evaluate(async () => {
      const S = window.Slink;
      const disk = S.state.offlineDisk;
      const scope = S.fn.activeOfflineScope();
      const url = '/api/stores/' + S.state.store.id + '/settings';
      const originalSnapshot = disk.snapshot;
      const originalNetwork = S.fn.networkRequest;
      let snapshots = 0;
      disk.snapshot = async (...args) => {
        snapshots++;
        return originalSnapshot(...args);
      };
      const settings = await S.fn.apiRequest(url);
      const onlineSnapshots = snapshots;
      const before = await disk.cachedResponse(scope, url);

      // Invalidate the cache while the HTTP response is in flight.
      let markStarted;
      let release;
      const started = new Promise(resolve => { markStarted = resolve; });
      S.fn.networkRequest = async (...args) => {
        const value = await originalNetwork(...args);
        markStarted();
        await new Promise(resolve => { release = resolve; });
        return { ...value, regressionMarker: true };
      };
      const pending = S.fn.apiRequest(url);
      await started;
      await disk.putMeta('epoch|' + scope, 'clear:epoch-race');
      release();
      await pending;
      S.fn.networkRequest = originalNetwork;
      const after = await disk.cachedResponse(scope, url);

      // A complete recent cache is reused. Permission invalidation must rebuild it.
      await disk.putMeta('prepared|' + scope, new Date().toISOString());
      await disk.putMeta('epoch|' + scope, 'warm:recent');
      await disk.removeMeta('cache-stale|' + scope);
      let preparations = 0;
      const originalCollect = S.fn.collectOfflineResponses;
      const originalImages = S.fn.prepareProductImages;
      S.fn.collectOfflineResponses = async () => {
        preparations++;
        return [{ url, value: settings }];
      };
      S.fn.prepareProductImages = async () => {};
      await S.fn.prepareOfflineData();
      const recentPreparations = preparations;
      await disk.putMeta('prepared|' + scope, new Date(Date.now() - 1000).toISOString());
      await disk.putMeta('cache-stale|' + scope, new Date(Date.now() - 100).toISOString());
      await S.fn.prepareOfflineData();
      const stalePreparations = preparations;
      await S.fn.prepareOfflineData();
      const reusedRebuiltPreparations = preparations;
      await disk.putMeta('epoch|' + scope, 'clear:permissions-changed');
      await S.fn.prepareOfflineData();
      const invalidatedPreparations = preparations;
      S.fn.collectOfflineResponses = originalCollect;
      S.fn.prepareProductImages = originalImages;
      return {
        onlineSnapshots,
        sameCachedValue: JSON.stringify(before.value) === JSON.stringify(after.value),
        recentPreparations,
        invalidatedPreparations,
        stalePreparations,
        reusedRebuiltPreparations,
        url,
      };
    });
    assert.equal(result.onlineSnapshots, 0);
    assert.equal(result.sameCachedValue, true);
    assert.equal(result.recentPreparations, 0);
    assert.equal(result.invalidatedPreparations, 2);
    assert.equal(result.stalePreparations, 1);
    assert.equal(result.reusedRebuiltPreparations, 1);
    const seed = await page.evaluate(async () => {
      const S = window.Slink;
      const base = '/api/stores/' + S.state.store.id;
      const { product } = await S.fn.apiRequest(base + '/products', {
        method: 'POST', body: { name: 'Chai kiểm thử', sku: 'SYNC-1', unit: 'chai', salePriceVnd: 1000, inventoryTracked: false },
      });
      S.fn.routeTo('pos');
      return { base, id: product.id };
    });
    await page.waitForFunction(id => window.Slink.state.posKnownProducts.has(id), seed.id);
    await page.evaluate(async ({ base, id }) => {
      const S = window.Slink;
      S.state.posSearchTerm = 'Chai';
      await S.fn.loadProductsPage('Chai', 0);
      const product = S.fn.productById(id);
      await S.fn.apiRequest(base + '/products/' + id, {
        method: 'PUT', body: { version: product.version, salePriceVnd: 2000 },
      });
    }, seed);
    let reloads = 0;
    const countReload = request => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === seed.base + '/products') reloads++;
    };
    page.on('request', countReload);
    await Promise.all([
      page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === seed.base + '/products'),
      page.evaluate(() => {
        window.Slink.fn.emitSyncDomains(['products', 'stock']);
        window.SlinkSyncBus.flush();
      }),
    ]);
    await page.waitForFunction(id => window.Slink.state.posKnownProducts.get(id)?.price === 2000, seed.id);
    assert.equal(reloads, 1);
    assert.equal(await page.evaluate(() => window.Slink.state.posSearchTerm), 'Chai');
    page.off('request', countReload);
    const staleGuards = await page.evaluate(async () => {
      const S = window.Slink;
      const originalApi = S.fn.apiRequest;
      const session = S.state.authSession;
      const warehouse = S.state.selectedWarehouseId;
      const before = JSON.stringify(S.state.store.products);
      async function delayedLoad(change) {
        let release;
        S.fn.apiRequest = () => new Promise(resolve => { release = resolve; });
        const pending = S.fn.loadProductsPage('Chai', 0, { silentLoading: true });
        change();
        release({ products: [], total: 0, nextOffset: null });
        await pending;
        return JSON.stringify(S.state.store.products) === before;
      }
      const warehouseIgnored = await delayedLoad(() => { S.state.selectedWarehouseId = 'different-warehouse'; });
      S.state.selectedWarehouseId = warehouse;
      const sessionIgnored = await delayedLoad(() => { S.state.authSession = { ...session }; });
      S.state.authSession = session;
      S.fn.apiRequest = originalApi;
      return { warehouseIgnored, sessionIgnored };
    });
    assert.deepEqual(staleGuards, { warehouseIgnored: true, sessionIgnored: true });
    await page.context().setOffline(true);
    const offline = await page.evaluate(async url => {
      const value = await window.Slink.fn.apiRequest(url);
      return Boolean(value.offlineCachedAt);
    }, result.url);
    assert.equal(offline, true);
    console.log('PASS cache performance, epoch race, warmup invalidation, POS event refresh once, stale response guards and offline reads');
  } finally {
    await browser.close();
    await app.close();
  }
}

if (require.main === module) run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
