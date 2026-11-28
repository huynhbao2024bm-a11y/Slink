'use strict';

const { ApiError, authenticate, requireCsrf } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');

const SHIFT_TYPES = {
  morning: { label: 'Ca sáng', start: '08:00', end: '12:00' },
  afternoon: { label: 'Ca chiều', start: '13:00', end: '17:30' },
  evening: { label: 'Ca tối', start: '17:30', end: '21:30' },
  full: { label: 'Cả ngày', start: '08:00', end: '17:30' },
};

function currentMonthString() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeWorkDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new ApiError(400, 'validation_error', 'Ngày làm việc phải có định dạng YYYY-MM-DD.');
  }
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) {
    throw new ApiError(400, 'validation_error', 'Ngày làm việc không hợp lệ.');
  }
  return text;
}

function normalizeTime(value, fallback) {
  const text = String(value || fallback || '').trim();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) {
    throw new ApiError(400, 'validation_error', 'Giờ ca làm việc không hợp lệ (HH:MM).');
  }
  return text;
}

function registerShiftRoutes(app, { pool, env }) {
  app.get('/api/stores/:storeId/shifts', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const month = typeof request.query?.month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(request.query.month)
      ? request.query.month
      : currentMonthString();
    const startDate = `${month}-01`;

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const isManager = membership.role === 'owner' || membership.role === 'manager';
      const shiftsRes = await client.query(
        `SELECT s.id, s.user_id, u.display_name, m.staff_code, m.role, m.job_title,
                s.work_date::text AS work_date, s.shift_type, s.shift_label,
                s.start_time, s.end_time, s.status,
                s.check_in_at, s.check_out_at, s.note
         FROM staff_shifts s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN memberships m ON m.store_id = s.store_id AND m.user_id = s.user_id
         WHERE s.store_id = $1
           AND s.work_date >= $2::date
           AND s.work_date < ($2::date + interval '1 month')
           AND ($3::boolean OR s.user_id = $4)
         ORDER BY s.work_date ASC, s.start_time ASC, u.display_name ASC`,
        [storeId, startDate, isManager, auth.userId]
      );

      const staffRes = await client.query(
        `SELECT m.user_id, u.display_name, m.staff_code, m.role, m.job_title
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.store_id = $1 AND m.status = 'active'
         ORDER BY (m.role = 'owner') DESC, u.display_name ASC`,
        [storeId]
      );

      const rows = shiftsRes.rows;
      const pendingCloseCount = rows.filter(r => r.status === 'checked_in' || r.status === 'late').length;
      const scheduledCount = rows.filter(r => r.status === 'scheduled').length;
      const completedCount = rows.filter(r => r.status === 'completed').length;
      const lateCount = rows.filter(r => r.status === 'late').length;

      return {
        month,
        shifts: rows,
        staff: staffRes.rows,
        summary: {
          totalCount: rows.length,
          pendingCloseCount,
          scheduledCount,
          completedCount,
          lateCount,
        },
      };
    });
  });

  app.post('/api/stores/:storeId/shifts', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');

    const body = request.body || {};
    const userId = typeof body.userId === 'string' ? body.userId : '';
    if (!UUID_PATTERN.test(userId)) throw new ApiError(400, 'validation_error', 'Nhân viên không hợp lệ.');
    const shiftType = typeof body.shiftType === 'string' && SHIFT_TYPES[body.shiftType] ? body.shiftType : 'morning';
    const defaults = SHIFT_TYPES[shiftType];
    const shiftLabel = typeof body.shiftLabel === 'string' && body.shiftLabel.trim() ? body.shiftLabel.trim().slice(0, 60) : defaults.label;
    const startTime = normalizeTime(body.startTime, defaults.start);
    const endTime = normalizeTime(body.endTime, defaults.end);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    const rawDates = Array.isArray(body.workDates) && body.workDates.length ? body.workDates : [body.workDate];
    if (rawDates.length > 31) throw new ApiError(400, 'validation_error', 'Chỉ phân ca tối đa 31 ngày mỗi lần.');
    const workDates = [...new Set(rawDates.map(normalizeWorkDate))];

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (membership.role !== 'owner' && membership.role !== 'manager') {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý mới được phân ca.');
      }
      const memberRes = await client.query(
        `SELECT user_id FROM memberships WHERE store_id = $1 AND user_id = $2 AND status = 'active'`,
        [storeId, userId]
      );
      if (!memberRes.rowCount) throw new ApiError(404, 'staff_not_found', 'Không tìm thấy nhân viên đang hoạt động.');

      const saved = [];
      for (const workDate of workDates) {
        const res = await client.query(
          `INSERT INTO staff_shifts (store_id, user_id, work_date, shift_type, shift_label, start_time, end_time, note, created_by)
           VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (store_id, user_id, work_date, shift_type)
           DO UPDATE SET shift_label = EXCLUDED.shift_label, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time, note = EXCLUDED.note, updated_at = now()
           RETURNING id, user_id, work_date::text AS work_date, shift_type, shift_label, start_time, end_time, status, check_in_at, check_out_at, note`,
          [storeId, userId, workDate, shiftType, shiftLabel, startTime, endTime, note, auth.userId]
        );
        saved.push(res.rows[0]);
      }
      return { shifts: saved };
    });
  });

  app.post('/api/stores/:storeId/shifts/:shiftId/check-in', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, shiftId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(shiftId)) {
      throw new ApiError(400, 'validation_error', 'Ca làm việc không hợp lệ.');
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const existing = await client.query(
        `SELECT s.id, s.user_id, s.work_date::text AS work_date, s.start_time, s.status,
                ((now() AT TIME ZONE st.timezone)::date)::text AS local_date,
                to_char(now() AT TIME ZONE st.timezone, 'HH24:MI') AS local_hhmm
         FROM staff_shifts s
         JOIN stores st ON st.id = s.store_id
         WHERE s.store_id = $1 AND s.id = $2 FOR UPDATE`,
        [storeId, shiftId]
      );
      if (!existing.rowCount) throw new ApiError(404, 'shift_not_found', 'Không tìm thấy ca làm việc.');
      const shift = existing.rows[0];
      const isManager = membership.role === 'owner' || membership.role === 'manager';
      if (!isManager && shift.user_id !== auth.userId) {
        throw new ApiError(403, 'forbidden', 'Bạn chỉ có thể check-in ca làm việc của chính mình.');
      }
      if (shift.status === 'completed') {
        throw new ApiError(409, 'shift_already_completed', 'Ca này đã chốt công hoàn tất.');
      }

      const [sh, sm] = shift.start_time.split(':').map(Number);
      const [lh, lm] = shift.local_hhmm.split(':').map(Number);
      const isLate = shift.local_date > shift.work_date
        || (shift.local_date === shift.work_date && (lh * 60 + lm) > (sh * 60 + sm + 15));
      const nextStatus = isLate ? 'late' : 'checked_in';

      const updated = await client.query(
        `UPDATE staff_shifts
         SET status = $2, check_in_at = COALESCE(check_in_at, now()), updated_at = now()
         WHERE id = $1
         RETURNING id, user_id, work_date::text AS work_date, shift_type, shift_label, start_time, end_time, status, check_in_at, check_out_at, note`,
        [shiftId, nextStatus]
      );
      return { shift: updated.rows[0] };
    });
  });

  app.post('/api/stores/:storeId/shifts/:shiftId/check-out', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, shiftId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(shiftId)) {
      throw new ApiError(400, 'validation_error', 'Ca làm việc không hợp lệ.');
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const existing = await client.query(
        `SELECT id, user_id, status FROM staff_shifts WHERE store_id = $1 AND id = $2 FOR UPDATE`,
        [storeId, shiftId]
      );
      if (!existing.rowCount) throw new ApiError(404, 'shift_not_found', 'Không tìm thấy ca làm việc.');
      const shift = existing.rows[0];
      const isManager = membership.role === 'owner' || membership.role === 'manager';
      if (!isManager && shift.user_id !== auth.userId) {
        throw new ApiError(403, 'forbidden', 'Bạn chỉ có thể chốt ca của chính mình.');
      }
      const updated = await client.query(
        `UPDATE staff_shifts
         SET status = 'completed', check_in_at = COALESCE(check_in_at, now()), check_out_at = now(), updated_at = now()
         WHERE id = $1
         RETURNING id, user_id, work_date::text AS work_date, shift_type, shift_label, start_time, end_time, status, check_in_at, check_out_at, note`,
        [shiftId]
      );
      return { shift: updated.rows[0] };
    });
  });

  app.delete('/api/stores/:storeId/shifts/:shiftId', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, shiftId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(shiftId)) {
      throw new ApiError(400, 'validation_error', 'Ca làm việc không hợp lệ.');
    }
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      if (membership.role !== 'owner' && membership.role !== 'manager') {
        throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng hoặc quản lý mới được xóa ca.');
      }
      const res = await client.query(`DELETE FROM staff_shifts WHERE store_id = $1 AND id = $2 RETURNING id`, [storeId, shiftId]);
      if (!res.rowCount) throw new ApiError(404, 'shift_not_found', 'Không tìm thấy ca làm việc.');
      return { deleted: true };
    });
  });
}

module.exports = { registerShiftRoutes };
