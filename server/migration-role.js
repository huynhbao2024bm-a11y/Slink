'use strict';

function assertMigrationRole(role) {
  if (!role || role.rolname !== 'slink_migrator') {
    throw new Error('MIGRATION_DATABASE_URL must authenticate as slink_migrator.');
  }
  if (role.rolsuper) {
    throw new Error('slink_migrator must not be a PostgreSQL superuser.');
  }
  if (!role.rolbypassrls) {
    throw new Error('slink_migrator needs BYPASSRLS so tenant-wide schema backfills can see every store protected by forced row-level security.');
  }
  if (!role.can_create_public_schema) {
    throw new Error('slink_migrator needs CREATE on the public schema to apply migrations.');
  }
}

module.exports = { assertMigrationRole };
