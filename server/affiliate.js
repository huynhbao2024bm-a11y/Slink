'use strict';

const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withUser } = require('./db');

const PLATFORMS = [
  { id: 'tiktok', name: 'TikTok Shop', creatorHelpUrl: 'https://seller-vn.tiktok.com/university/essay?knowledge_id=1679024774448913', sellerChannelCode: 'tiktok_shop', sellerUrl: 'https://seller-vn.tiktok.com/', connectionStatus: 'not_connected' },
  { id: 'shopee', name: 'Shopee', sellerChannelCode: 'shopee', creatorUrl: 'https://affiliate.shopee.vn/dashboard', sellerUrl: 'https://banhang.shopee.vn/', connectionStatus: 'not_connected' },
];
const HOSTS = {
  tiktok: new Set(['tiktok.com', 'www.tiktok.com', 'vt.tiktok.com', 'vm.tiktok.com', 'shop.tiktok.com', 'tiktokshop.com', 'www.tiktokshop.com', 'vt.tiktokshop.com']),
  shopee: new Set(['shopee.vn', 'www.shopee.vn', 's.shopee.vn', 'shope.ee', 'vn.shp.ee']),
};
function normalizeLink(input) {
  let url;
  try { url = new URL(input); } catch { throw new ApiError(400, 'invalid_affiliate_link', 'Dán đường dẫn do TikTok Shop hoặc Shopee cung cấp.'); }
  const platform = Object.keys(HOSTS).find(key => HOSTS[key].has(url.hostname.toLowerCase()));
  if (!platform || url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2048) {
    throw new ApiError(400, 'invalid_affiliate_link', 'Dùng link HTTPS của TikTok Shop hoặc Shopee.');
  }
  // Preserve provider parameters and fragments; never invent a tracking/commission ID.
  return { platform, url: url.href };
}

function registerAffiliateRoutes(app, { pool, env }) {
  app.put('/api/account/workspace', async request => {
    const auth = await authenticate(pool, request); requireCsrf(request, env);
    const mode = request.body?.mode;
    if (!['shop', 'affiliate'].includes(mode)) throw new ApiError(400, 'validation_error', 'Chọn Chủ shop hoặc Affiliate.');
    return withUser(pool, auth.userId, async client => {
      if (mode === 'shop') {
        const stores = await client.query("SELECT 1 FROM memberships WHERE user_id=$1 AND status='active' LIMIT 1", [auth.userId]);
        if (!stores.rowCount) throw new ApiError(409, 'shop_required', 'Tài khoản này chưa có cửa hàng.');
      }
      await client.query('UPDATE users SET workspace_mode=$2, updated_at=now() WHERE id=$1', [auth.userId, mode]);
      return { mode };
    });
  });
  app.get('/api/commerce/platforms', async request => {
    await authenticate(pool, request);
    return { platforms: PLATFORMS, earnings: null, note: 'Chưa kết nối dữ liệu tài khoản sàn. Lưu link không xác nhận quyền nhận hoa hồng.' };
  });
  app.get('/api/affiliate/links', async request => {
    const auth = await authenticate(pool, request);
    const offset = Number(request.query?.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new ApiError(400, 'validation_error', 'Trang danh sách không hợp lệ.');
    return withUser(pool, auth.userId, async client => {
      const result = await client.query(
        `SELECT id, platform, title, affiliate_url, status, version, created_at, updated_at, COUNT(*) OVER()::int AS total_count
         FROM affiliate_links WHERE user_id = $1 AND status = 'active' ORDER BY updated_at DESC, id LIMIT 51 OFFSET $2`,
        [auth.userId, offset]
      );
      return { links: result.rows.slice(0, 50), total: result.rows[0]?.total_count || 0, nextOffset: result.rowCount > 50 ? offset + 50 : null };
    });
  });
  app.post('/api/affiliate/links', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const link = normalizeLink(request.body?.url);
    const rawTitle = request.body?.title;
    if (rawTitle !== undefined && typeof rawTitle !== 'string') throw new ApiError(400, 'validation_error', 'Tên link không hợp lệ.');
    const title = rawTitle?.trim() || (link.platform === 'tiktok' ? 'Sản phẩm TikTok Shop' : 'Sản phẩm Shopee');
    if (title.length > 240) throw new ApiError(400, 'validation_error', 'Tên link tối đa 240 ký tự.');
    const result = await withUser(pool, auth.userId, async client => {
      const created = await client.query(
        `INSERT INTO affiliate_links (user_id, platform, title, affiliate_url) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, platform, affiliate_url) DO NOTHING RETURNING id, platform, title, affiliate_url, status, version`,
        [auth.userId, link.platform, title, link.url]
      );
      if (created.rowCount) return { link: created.rows[0], created: true };
      const old = await client.query('SELECT id, platform, title, affiliate_url, status, version FROM affiliate_links WHERE user_id=$1 AND platform=$2 AND affiliate_url=$3', [auth.userId, link.platform, link.url]);
      if (old.rows[0].status === 'archived') throw new ApiError(409, 'archived_link', 'Link này đã lưu trữ trước đó.');
      return { link: old.rows[0], created: false };
    });
    return reply.code(result.created ? 201 : 200).send(result);
  });
  app.put('/api/affiliate/links/:linkId', async request => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { linkId } = request.params;
    const { version, title, status } = request.body || {};
    if (!UUID_PATTERN.test(linkId) || !Number.isSafeInteger(version) || version < 1 || (title !== undefined && (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 240)) || (status !== undefined && !['active', 'archived'].includes(status))) throw new ApiError(400, 'validation_error', 'Kiểm tra lại tên và trạng thái link.');
    return withUser(pool, auth.userId, async client => {
      const result = await client.query(
        `UPDATE affiliate_links SET title=COALESCE($3,title), status=COALESCE($4,status), version=version+1, updated_at=now()
         WHERE user_id=$1 AND id=$2 AND version=$5 RETURNING id, platform, title, affiliate_url, status, version`,
        [auth.userId, linkId, title?.trim() || null, status || null, version]
      );
      if (!result.rowCount) throw new ApiError(409, 'link_conflict', 'Link đã thay đổi hoặc không thuộc tài khoản này. Tải lại danh sách để kiểm tra.');
      return { link: result.rows[0] };
    });
  });
}

module.exports = { registerAffiliateRoutes, normalizeLink, PLATFORMS };
