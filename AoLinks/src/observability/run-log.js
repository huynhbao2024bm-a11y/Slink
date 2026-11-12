'use strict';

const path = require('node:path');
const { appendFile, mkdir } = require('node:fs/promises');

const LOG_DIRECTORY = path.resolve(__dirname, '../../Logs');

async function writeRunLog({ runId, workflowId, status, occurredAt }, logDirectory = LOG_DIRECTORY) {
  const record = {
    runId,
    workflowId,
    status,
    mode: 'dry_run',
    occurredAt,
  };
  const day = occurredAt.slice(0, 10);
  const filePath = path.join(logDirectory, `runtime-${day}.jsonl`);
  await mkdir(logDirectory, { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: 'a' });
}

module.exports = { writeRunLog };
