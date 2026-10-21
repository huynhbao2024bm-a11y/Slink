'use strict';

const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { databaseTransportOptions } = require('../database-transport');

test('direct TLS mode verifies the database certificate', () => {
  assert.deepEqual(databaseTransportOptions({ NODE_ENV: 'production', PG_SSL: 'true' }, 'postgresql://slink_app:secret@db.example.test/slink'), {
    ssl: { rejectUnauthorized: true },
  });
});

test('production can verify a private database CA certificate', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'slink-pg-ca-'));
  const caPath = path.join(directory, 'db-ca.pem');
  const ca = '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n';
  writeFileSync(caPath, ca);
  try {
    assert.deepEqual(databaseTransportOptions({
      NODE_ENV: 'production',
      PG_SSL: 'ca-file',
      PG_SSL_CA_FILE: caPath,
    }, 'postgresql://slink_app:secret@db/slink'), {
      ssl: { rejectUnauthorized: true, ca },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('private-CA mode rejects missing, malformed, or unreadable CA paths', () => {
  assert.throws(() => databaseTransportOptions({ NODE_ENV: 'production', PG_SSL: 'ca-file' }, 'postgresql://slink_app:secret@db/slink'), /PG_SSL_CA_FILE/);
  assert.throws(() => databaseTransportOptions({
    NODE_ENV: 'production',
    PG_SSL: 'ca-file',
    PG_SSL_CA_FILE: 'relative.pem',
  }, 'postgresql://slink_app:secret@db/slink'), /absolute path/);
  assert.throws(() => databaseTransportOptions({
    NODE_ENV: 'production',
    PG_SSL: 'ca-file',
    PG_SSL_CA_FILE: path.join(os.tmpdir(), `missing-${Date.now()}.pem`),
  }, 'postgresql://slink_app:secret@db/slink'), /could not be read/);
});

test('private-CA mode rejects conflicting SSL URL overrides', () => {
  const caPath = path.join(os.tmpdir(), 'unused-cert.pem');
  const env = { NODE_ENV: 'production', PG_SSL: 'ca-file', PG_SSL_CA_FILE: caPath };
  assert.throws(() => databaseTransportOptions(env, 'postgresql://slink_app:secret@db/slink?sslmode=require'), /must not include SSL query options/);
});

test('production refuses plaintext and unknown transport settings', () => {
  assert.throws(() => databaseTransportOptions({ NODE_ENV: 'production', PG_SSL: 'false' }, 'postgresql://slink_app:secret@localhost/slink'), /require verified TLS/);
  assert.throws(() => databaseTransportOptions({ NODE_ENV: 'production', PG_SSL: 'proxy' }, 'postgresql://slink_app:secret@localhost/slink'), /PG_SSL must be true, false, or ca-file/);
});

test('local development can keep SSL disabled', () => {
  assert.deepEqual(databaseTransportOptions({ NODE_ENV: 'development', PG_SSL: 'false' }, 'postgresql://slink_app:secret@127.0.0.1:5433/slink'), {});
});
