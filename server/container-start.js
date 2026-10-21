'use strict';

const { readFileSync, statSync } = require('node:fs');
const { spawn } = require('node:child_process');

const secretNames = [
  'APP_DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'BACKUP_DATABASE_URL',
  'EMAIL_DELIVERY_URL',
  'EMAIL_DELIVERY_TOKEN',
  'SLINK_BACKUP_ENCRYPTION_KEY',
];

for (const name of secretNames) {
  const filePath = process.env[`${name}_FILE`];
  if (!filePath) continue;
  try {
    const file = statSync(filePath);
    if (!file.isFile() || file.size > 16384) throw new Error('invalid secret file');
    process.env[name] = readFileSync(filePath, 'utf8').replace(/\r?\n$/, '');
    if (!process.env[name]) throw new Error('empty secret');
  } catch {
    process.stderr.write(`Required secret file for ${name} is missing or invalid.\n`);
    process.exit(1);
  }
}

const [script, ...args] = process.argv.slice(2);
if (!script) {
  process.stderr.write('A Slink entrypoint script is required.\n');
  process.exit(2);
}

const child = spawn(process.execPath, [script, ...args], { env: process.env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  process.stderr.write(`Unable to start Slink process: ${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
