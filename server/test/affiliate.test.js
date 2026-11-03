'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { buildServer } = require('../index');
const { createPGlitePool } = require('../pglite-test-pool');
const { normalizeLink } = require('../affiliate');
const origin = 'http://affiliate.test';

test('affiliate can register without a store, keep personal links for both platforms and switch an owner workspace', async t => {
  const { PGlite } = await import('@electric-sql/pglite'); const db = new PGlite();
  const dir = path.join(__dirname, '../migrations');
  for (const name of (await fs.readdir(dir)).filter(n => n.endsWith('.sql')).sort()) await db.exec(await fs.readFile(path.join(dir, name), 'utf8'));
  await db.exec('CREATE ROLE slink_app NOLOGIN; GRANT USAGE ON SCHEMA public TO slink_app; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO slink_app; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO slink_app;');
  const app = await buildServer({ pool: createPGlitePool(db), logger: false, env: { NODE_ENV: 'test', PUBLIC_ORIGIN: origin } }); t.after(() => app.close());
  async function register(email, mode) {
    let r = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin }, payload: { email, displayName: 'Test user', password: 'affiliate test password 47', workspaceMode: mode, ...(mode === 'shop' ? { storeName: 'Test shop' } : {}) } }); assert.equal(r.statusCode, 201, r.body);
    const token = new URLSearchParams(new URL(r.json().developmentVerificationUrl).hash.slice(1)).get('token');
    await app.inject({ method: 'POST', url: '/api/auth/verify-email', headers: { origin }, payload: { token } });
    r = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin }, payload: { email, password: 'affiliate test password 47' } }); assert.equal(r.statusCode, 200, r.body);
    const headers = { origin, cookie: r.cookies.map(c => c.name + '=' + c.value).join('; '), 'x-csrf-token': r.cookies.find(c => c.name.includes('csrf')).value };
    return { user: r.json().user, stores: r.json().stores, headers };
  }
  const creator = await register('creator@affiliate.test', 'affiliate'); const owner = await register('owner@affiliate.test', 'shop');
  assert.equal(creator.user.workspaceMode, 'affiliate'); assert.deepEqual(creator.stores, []); assert.equal(owner.stores.length, 1);
  let r = await app.inject({ url: '/api/auth/me', headers: creator.headers }); assert.equal(r.json().user.workspaceMode, 'affiliate'); assert.deepEqual(r.json().stores, []);
  const post = (url, headers=creator.headers) => app.inject({ method: 'POST', url: '/api/affiliate/links', headers, payload: { url } });
  let created = await post('https://s.shopee.vn/sample?sub_id=demo'); assert.equal(created.statusCode, 201, created.body); const link=created.json().link; assert.equal(link.platform,'shopee');
  assert.equal((await post('https://s.shopee.vn/sample?sub_id=demo')).statusCode, 200);
  assert.equal((await post('https://vt.tiktok.com/sample/')).json().link.platform, 'tiktok');
  r=await app.inject({ url:'/api/affiliate/links',headers:creator.headers }); assert.equal(r.json().links.length,2); assert.ok(r.json().links.some(l=>l.affiliate_url.includes('sub_id=demo')));
  assert.equal((await app.inject({url:'/api/affiliate/links',headers:owner.headers})).json().links.length,0);
  assert.equal((await app.inject({method:'PUT',url:'/api/affiliate/links/'+link.id,headers:owner.headers,payload:{title:'Other user',version:link.version}})).statusCode,409);
  r=await app.inject({method:'PUT',url:'/api/affiliate/links/'+link.id,headers:creator.headers,payload:{title:'My video',version:link.version}}); assert.equal(r.statusCode,200,r.body);
  assert.equal((await app.inject({method:'PUT',url:'/api/affiliate/links/'+link.id,headers:creator.headers,payload:{title:'Stale',version:link.version}})).statusCode,409);
  assert.equal((await app.inject({url:'/api/affiliate/links'})).statusCode,401);
  assert.equal((await post('https://evil.example/?url=https://shopee.vn')).statusCode,400);
  r=await app.inject({url:'/api/commerce/platforms',headers:creator.headers}); assert.equal(r.json().platforms.length,2);assert.equal(r.json().earnings,null);assert.ok(r.json().platforms.every(p=>p.connectionStatus==='not_connected'));
  assert.equal((await app.inject({method:'PUT',url:'/api/account/workspace',headers:creator.headers,payload:{mode:'shop'}})).statusCode,409);
  assert.equal((await app.inject({method:'PUT',url:'/api/account/workspace',headers:owner.headers,payload:{mode:'affiliate'}})).statusCode,200);
  assert.equal((await app.inject({url:'/api/auth/me',headers:owner.headers})).json().user.workspaceMode,'affiliate');
  assert.equal((await app.inject({method:'PUT',url:'/api/account/workspace',headers:owner.headers,payload:{mode:'shop'}})).statusCode,200);
});

test('link normalization preserves attribution but rejects credentials, foreign hosts and non-HTTPS schemes',()=>{
 for(const url of ['javascript:alert(1)','http://shopee.vn/test','https://shopee.vn.evil.example/','https://user:pass@shopee.vn/','https://127.0.0.1/','https://shopee.vn:444/'])assert.throws(()=>normalizeLink(url));
 assert.equal(normalizeLink('https://www.tiktok.com/@creator/video/123?share=abc#source').url,'https://www.tiktok.com/@creator/video/123?share=abc#source');
});
