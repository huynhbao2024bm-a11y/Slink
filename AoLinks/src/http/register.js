'use strict';

const { randomUUID } = require('node:crypto');
const { ApiError, authenticate, requireCsrf } = require('../../../server/auth');
const { UUID_PATTERN, withStore } = require('../../../server/db');
const { runDryRun } = require('../core/engine');
const { writeRunLog } = require('../observability/run-log');

const MANAGEMENT_ROLES = new Set(['owner', 'manager']);

function registerAoLinksRoutes(app, {
  pool,
  env,
  authenticateSession = authenticate,
  verifyCsrf = requireCsrf,
  runWithStore = withStore,
  recordRunLog = writeRunLog,
} = {}) {
  if (!pool || !env) throw new Error('AoLinks requires the host database pool and environment.');

  app.post('/api/stores/:storeId/aolinks/dry-runs', async (request, reply) => {
    const auth = await authenticateSession(pool, request);
    verifyCsrf(request, env);
    const storeId = request.params.storeId;
    if (!UUID_PATTERN.test(storeId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    }
    const runId = randomUUID();
    const result = await runWithStore(pool, auth.userId, storeId, async (client, membership) => {
      if (!MANAGEMENT_ROLES.has(membership.role)) {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý được chạy mô phỏng.');
      }
      const evaluated = runDryRun(request.body?.workflow, request.body?.event);
      const occurredAt = new Date().toISOString();
      await client.query(
        `INSERT INTO automation_runs
           (id, store_id, actor_user_id, workflow_id, workflow_name, event_type, mode, status, result, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'dry_run', $7, $8::jsonb, $9)`,
        [
          runId,
          storeId,
          auth.userId,
          evaluated.workflow.id,
          evaluated.workflow.name,
          evaluated.eventType,
          evaluated.status,
          JSON.stringify(evaluated),
          occurredAt,
        ]
      );
      await recordRunLog({
        runId,
        workflowId: evaluated.workflow.id,
        status: evaluated.status,
        occurredAt,
      });
      return evaluated;
    });
    return reply.code(201).send({ runId, ...result });
  });
}

module.exports = { registerAoLinksRoutes };
