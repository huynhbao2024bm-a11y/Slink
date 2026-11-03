'use strict';

const sharp = require('sharp');
const { createHash } = require('node:crypto');
const { ApiError, authenticate } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');

// Only bounded raster input; decode and re-encode to strip uploaded metadata.
async function prepareProductImage(value) {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string' || value.length > 700000) {
    throw new ApiError(400, 'invalid_product_image', 'Ảnh quá lớn. Hãy chọn ảnh khác.');
  }
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new ApiError(400, 'invalid_product_image', 'Chọn ảnh JPG, PNG hoặc WebP hợp lệ.');
  const input = Buffer.from(match[2], 'base64');
  try {
    const meta = await sharp(input, { limitInputPixels: 20000000 }).metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format) || (meta.pages || 1) > 1) throw new Error('unsupported');
    let content = await sharp(input, { limitInputPixels: 20000000 }).rotate().resize(720, 720, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80 }).toBuffer();
    if (content.length > 262144) content = await sharp(content).resize(540, 540, { fit: 'inside' }).jpeg({ quality: 65 }).toBuffer();
    if (content.length > 262144) throw new Error('size');
    return { content, digest: createHash('sha256').update(content).digest('hex') };
  } catch {
    throw new ApiError(400, 'invalid_product_image', 'Không đọc được ảnh. Hãy chọn ảnh JPG, PNG hoặc WebP khác.');
  }
}

// Called inside the same product/stock transaction and after editor authorization.
async function writeProductImage(client, storeId, productId, image, actorId) {
  if (image === undefined) return {};
  if (image === null) {
    await client.query('DELETE FROM product_images WHERE store_id = $1 AND product_id = $2', [storeId, productId]);
  } else {
    await client.query(
      `INSERT INTO product_images (store_id, product_id, content, digest) VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id, product_id) DO UPDATE SET content = EXCLUDED.content, digest = EXCLUDED.digest, updated_at = now()`,
      [storeId, productId, image.content, image.digest]
    );
  }
  const result = await client.query(
    `UPDATE products SET image_version = image_version + 1, image_content_type = $3 WHERE store_id = $1 AND id = $2
     RETURNING image_version, image_content_type`, [storeId, productId, image === null ? null : 'image/jpeg']
  );
  await client.query(
    `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, 'product', $4, jsonb_build_object('imageVersion', $5::integer, 'digest', $6::text))`,
    [storeId, actorId, image === null ? 'product.image_removed' : 'product.image_saved', productId, result.rows[0].image_version, image?.digest || null]
  );
  return result.rows[0];
}

function registerProductImageRoutes(app, { pool }) {
  app.get('/api/stores/:storeId/products/:productId/image', async (request, reply) => {
    const auth = await authenticate(pool, request);
    const { storeId, productId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(productId)) throw new ApiError(400, 'validation_error', 'Ảnh sản phẩm không hợp lệ.');
    const image = await withStore(pool, auth.userId, storeId, async (client) => {
      const result = await client.query('SELECT content, digest FROM product_images WHERE store_id = $1 AND product_id = $2', [storeId, productId]);
      if (!result.rowCount) throw new ApiError(404, 'image_not_found', 'Sản phẩm chưa có ảnh.');
      return result.rows[0];
    });
    const etag = '"' + image.digest + '"';
    reply.header('Cache-Control', 'private, no-cache').header('ETag', etag).header('X-Content-Type-Options', 'nosniff');
    if (request.headers['if-none-match'] === etag) return reply.code(304).send();
    return reply.type('image/jpeg').send(Buffer.from(image.content));
  });
}

module.exports = { prepareProductImage, writeProductImage, registerProductImageRoutes };
