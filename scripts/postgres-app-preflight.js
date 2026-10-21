const { existsSync } = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const repoRoot = path.resolve(__dirname, '..');
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function fail(message) {
  process.stderr.write(`FAIL ${message}\n`);
  process.exitCode = 1;
}

function errorHint(code) {
  switch (code) {
    case '28P01':
    case '28000':
      return 'PostgreSQL rejected the slink_app credentials. Check APP_DATABASE_URL in the protected local .env; do not paste its value into chat.';
    case 'ECONNREFUSED':
      return 'PostgreSQL is not accepting connections. Start the Slink cluster with: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\postgres-local.ps1 -Action start. Then rerun this check.';
    case 'ETIMEDOUT':
    case 'EHOSTUNREACH':
      return 'The configured database address is not reachable from this PowerShell session.';
    case 'EACCES':
      return 'This process cannot access the configured database socket. Run the check from the same Windows user/session that runs PostgreSQL.';
    case '3D000':
      return 'The configured database does not exist.';
    case '57P03':
      return 'PostgreSQL is starting up and is not ready to accept queries yet.';
    default:
      return 'Check the local PostgreSQL process and APP_DATABASE_URL without sharing its password.';
  }
}

async function main() {
  const connectionString = process.env.APP_DATABASE_URL;
  if (!connectionString) throw new Error('APP_DATABASE_URL is missing from the protected local .env.');

  let connection;
  try {
    connection = new URL(connectionString);
  } catch {
    throw new Error('APP_DATABASE_URL is not a valid PostgreSQL URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(connection.protocol)) {
    throw new Error('APP_DATABASE_URL must use the PostgreSQL protocol.');
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(connection.hostname)) {
    throw new Error('This local preflight only connects to loopback PostgreSQL; no remote connection was attempted.');
  }
  if (decodeURIComponent(connection.username) !== 'slink_app') {
    throw new Error('APP_DATABASE_URL must authenticate as slink_app; no database connection was attempted.');
  }
  if (decodeURIComponent(connection.pathname.replace(/^\//, '')) !== 'slink') {
    throw new Error('APP_DATABASE_URL must target the local slink database; no database connection was attempted.');
  }

  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 5000,
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    application_name: 'slink-app-preflight',
  });

  try {
    const result = await pool.query(
      'SELECT current_user AS role_name, current_database() AS database_name, inet_server_port() AS server_port'
    );
    const row = result.rows[0];
    if (row.role_name !== 'slink_app' || row.database_name !== 'slink') {
      throw new Error('Connected identity did not match the expected local application role and database.');
    }
    process.stdout.write(`PASS slink_app connected to slink on local PostgreSQL port ${row.server_port}; read-only SELECT succeeded.\n`);
  } catch (error) {
    if (error.code) {
      fail(`application-role database connection failed (${error.code}). ${errorHint(error.code)}`);
      return;
    }
    fail(error.message || 'Application-role database preflight failed.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => fail(error.message || 'Application-role database preflight failed.'));
