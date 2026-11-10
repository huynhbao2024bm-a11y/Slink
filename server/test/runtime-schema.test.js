'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const { assertRuntimeSchema } = require('../runtime-schema');

test('runtime rejects the pre-upgrade schema before accepting traffic and accepts applied migrations', async t => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite(); t.after(() => db.close());
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of (await fs.readdir(directory)).filter(n => n.endsWith('.sql')).sort()) {
    if (name.startsWith('0025_') || name.startsWith('0027_') || name.includes('purchase_unit_packs')) await assert.rejects(() => assertRuntimeSchema(db), /Apply migrations through 20261110050914/);
    await db.exec(await fs.readFile(path.join(directory, name), 'utf8'));
  }
  await assert.doesNotReject(() => assertRuntimeSchema(db));
});
