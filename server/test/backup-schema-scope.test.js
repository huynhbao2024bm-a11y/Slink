'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { test } = require('node:test');
const { validateIncludedSchemas } = require('../../scripts/postgres-backup');

test('backup schema scope accepts exact names and rejects empty, duplicate and wildcard scopes', () => {
  assert.deepEqual(validateIncludedSchemas(['public']), ['public']);
  assert.deepEqual(validateIncludedSchemas(['public', 'extra_data']), ['public', 'extra_data']);
  for (const scope of [[], ['public', 'public'], [''], ['*'], ['public*'], ['public,auth'], ['Public'], ['public; DROP SCHEMA public'], ['public', null]]) {
    assert.throws(() => validateIncludedSchemas(scope), /Backup schema scope/);
  }
});

test('invalid requested backup scope fails before connecting to PostgreSQL', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, '../../scripts/postgres-backup.js'), 'create'], {
    env: { ...process.env, SLINK_BACKUP_SCHEMAS: 'public,*', BACKUP_DATABASE_URL: '', SLINK_BACKUP_ENCRYPTION_KEY: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Backup schema scope/);
});
