'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { assertMigrationRole } = require('../migration-role');

test('migrations require a dedicated non-superuser role that can bypass forced tenant RLS', () => {
  assert.doesNotThrow(() => assertMigrationRole({
    rolname: 'slink_migrator', rolsuper: false, rolbypassrls: true, can_create_public_schema: true,
  }));
  assert.throws(() => assertMigrationRole({
    rolname: 'slink_migrator', rolsuper: false, rolbypassrls: false, can_create_public_schema: true,
  }), /BYPASSRLS/);
  assert.throws(() => assertMigrationRole({
    rolname: 'slink_migrator', rolsuper: true, rolbypassrls: true, can_create_public_schema: true,
  }), /must not be a PostgreSQL superuser/);
  assert.throws(() => assertMigrationRole({
    rolname: 'postgres', rolsuper: true, rolbypassrls: true, can_create_public_schema: true,
  }), /must authenticate as slink_migrator/);
  assert.throws(() => assertMigrationRole({
    rolname: 'slink_migrator', rolsuper: false, rolbypassrls: true, can_create_public_schema: false,
  }), /CREATE on the public schema/);
});
