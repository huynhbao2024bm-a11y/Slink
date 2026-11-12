'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const path = require('node:path');
const { test } = require('node:test');
const { writeRunLog } = require('../src/observability/run-log');

test('activity file log contains only the approved dry-run metadata', async (t) => {
  const testLogRoot = path.resolve(__dirname, '../Logs/test-runs');
  const directory = await mkdtemp(path.join(testLogRoot, '.runtime-log-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const record = {
    runId: '4a99980f-dcf0-47bc-b6d1-10265d4a0f69',
    workflowId: 'sample-check',
    status: 'matched',
    occurredAt: '2026-11-12T08:00:00.000Z',
  };

  await writeRunLog(record, directory);
  const contents = await readFile(path.join(directory, 'runtime-2026-11-12.jsonl'), 'utf8');
  const parsed = JSON.parse(contents.trim());
  assert.deepEqual(Object.keys(parsed).sort(), ['mode', 'occurredAt', 'runId', 'status', 'workflowId'].sort());
  assert.equal(parsed.mode, 'dry_run');
  assert.equal(parsed.workflowId, record.workflowId);
});
