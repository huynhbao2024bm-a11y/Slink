'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');

function databaseTransportOptions(env, connectionString, variableName = 'database URL') {
  const mode = env.PG_SSL;
  if (mode === 'true') return { ssl: { rejectUnauthorized: true } };

  if (mode === 'ca-file') {
    if (env.NODE_ENV !== 'production') throw new Error('PG_SSL=ca-file is only valid in production.');
    const caPath = env.PG_SSL_CA_FILE;
    if (typeof caPath !== 'string' || !path.isAbsolute(caPath)) {
      throw new Error('PG_SSL_CA_FILE must be an absolute path to the database CA certificate.');
    }
    let databaseUrl;
    try {
      databaseUrl = new URL(connectionString);
    } catch {
      throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
    }
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !databaseUrl.hostname) {
      throw new Error(`${variableName} must be a valid PostgreSQL URL.`);
    }
    if (databaseUrl.searchParams.has('sslmode') || databaseUrl.searchParams.has('sslrootcert')) {
      throw new Error(`${variableName} must not include SSL query options when PG_SSL=ca-file.`);
    }
    let ca;
    try {
      ca = readFileSync(caPath, 'utf8');
    } catch {
      throw new Error('PG_SSL_CA_FILE could not be read. Mount the trusted database CA certificate before starting Slink.');
    }
    if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
      throw new Error('PG_SSL_CA_FILE does not contain a PEM certificate.');
    }
    return { ssl: { rejectUnauthorized: true, ca } };
  }

  if (mode && mode !== 'false') {
    throw new Error('PG_SSL must be true, false, or ca-file.');
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('Production database connections require verified TLS. Set PG_SSL=true or configure PG_SSL=ca-file with PG_SSL_CA_FILE.');
  }
  return {};
}

module.exports = { databaseTransportOptions };
