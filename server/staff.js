'use strict';

const { ApiError, authenticate, assertSameOrigin, deliverEmail, digest, hashPassword, newToken, requireCsrf, sendVerification, emailVerificationDisabled, createUserSession } = require('./auth');
const { UUID_PATTERN, withStore, withUser } = require('./db');
const {
  ROLE_DEFAULTS,
  normalizeStoredPermissions,
  resolveEffectivePermissions,
  validatePermissionsInput,
} = require('./rbac');

const STAFF_ROLES = new Set(['manager', 'cashier', 'stockkeeper', 'accountant']);
const STAFF_STATUSES = new Set(['active', 'suspended']);
const INVITE_HOURS = 168;

function validateStaffProfileFields(body = {}, { partial = true } = {}) {
  const out = {};
  if (!partial || body.staffCode !== undefined) {
    const code = body.staffCode == null ? '' : String(body.staffCode).trim();
    if (code.length > 40) throw new ApiError(400, 'validation_error', 'Mã nhân viên tối đa 40 ký tự.');
    out.staffCode = code || null;
  }
  if (!partial || body.phone !== undefined) {
    const phone = body.phone == null ? '' : String(body.phone).trim();
    const digits = phone.replace(/\D/g, '');
    if (phone && (digits.length < 7 || digits.length > 15 || phone.length > 32)) {
      throw new ApiError(400, 'validation_error', 'Số điện thoại nhân viên cần từ 7 đến 15 chữ số.');
    }
    out.phone = phone || null;
  }
  if (!partial || body.jobTitle !== undefined) {
    const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '';
    if (jobTitle.length > 120) throw new ApiError(400, 'validation_error', 'Chức danh tối đa 120 ký tự.');
    out.jobTitle = jobTitle;
  }
  if (!partial || body.note !== undefined) {
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > 500) throw new ApiError(400, 'validation_error', 'Ghi chú nhân viên tối đa 500 ký tự.');
    out.note = note;
  }
  if (!partial || body.commissionRateBps !== undefined) {
    const raw = body.commissionRateBps === '' || body.commissionRateBps == null ? 0 : Number(body.commissionRateBps);
    if (!Number.isSafeInteger(raw) || raw < 0 || raw > 10000) {
      throw new ApiError(400, 'validation_error', 'Tỷ lệ hoa hồng không hợp lệ (0–100%).');
    }
    out.commissionRateBps = raw;
  }
  if (!partial || body.baseSalaryVnd !== undefined) {
    const raw = body.baseSalaryVnd === '' || body.baseSalaryVnd == null ? '0' : String(body.baseSalaryVnd).trim();
    if (!/^(0|[1-9]\d{0,14})$/.test(raw)) {
      throw new ApiError(400, 'validation_error', 'Lương cơ bản phải là số VND nguyên không âm.');
    }
    out.baseSalaryVnd = raw;
  }
  if (!partial || body.salaryMode !== undefined) {
    const mode = body.salaryMode == null || body.salaryMode === '' ? 'monthly' : String(body.salaryMode).trim();
    if (!['monthly', 'shift', 'hourly'].includes(mode)) {
      throw new ApiError(400, 'validation_error', 'Hình thức tính lương không hợp lệ.');
    }
    out.salaryMode = mode;
  }
  if (!partial || body.standardDaysPerMonth !== undefined) {
    const days = body.standardDaysPerMonth == null || body.standardDaysPerMonth === '' ? 26 : Number(body.standardDaysPerMonth);
    if (!Number.isSafeInteger(days) || days < 1 || days > 31) {
      throw new ApiError(400, 'validation_error', 'Số ngày công chuẩn trong tháng phải từ 1 đến 31.');
    }
    out.standardDaysPerMonth = days;
  }
  if (!partial || body.bankBin !== undefined) {
    const bankBin = body.bankBin == null ? '' : String(body.bankBin).trim();
    if (bankBin.length > 20) throw new ApiError(400, 'validation_error', 'Mã ngân hàng tối đa 20 ký tự.');
    out.bankBin = bankBin || null;
  }
  if (!partial || body.bankAccountNumber !== undefined) {
    const acc = body.bankAccountNumber == null ? '' : String(body.bankAccountNumber).trim();
    if (acc.length > 40) throw new ApiError(400, 'validation_error', 'Số tài khoản ngân hàng tối đa 40 ký tự.');
    out.bankAccountNumber = acc || null;
  }
  if (!partial || body.bankAccountOwner !== undefined) {
    const ownerName = body.bankAccountOwner == null ? '' : String(body.bankAccountOwner).trim();
    if (ownerName.length > 120) throw new ApiError(400, 'validation_error', 'Tên chủ tài khoản ngân hàng tối đa 120 ký tự.');
    out.bankAccountOwner = ownerName || null;
  }
  if (body.displayName !== undefined) {
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (displayName.length < 2 || displayName.length > 120) {
      throw new ApiError(400, 'validation_error', 'Tên nhân viên cần từ 2 đến 120 ký tự.');
    }
    out.displayName = displayName;
  }
  return out;
}

function assertOwner(membership) {
  if (membership.role !== 'owner') throw new ApiError(403, 'forbidden', 'Chỉ chủ cửa hàng mới được quản lý nhân viên.');
}

function validToken(token) {
  return typeof token === 'string' && token.length >= 32 && token.length <= 128;
}

function pending(invitation) {
  return !invitation.accepted_at && !invitation.revoked_at && new Date(invitation.expires_at).getTime() > Date.now();
}

async function withInvitation(pool, rawToken, operation) {
  if (!validToken(rawToken)) throw new ApiError(404, 'invitation_unavailable', 'Lời mời không hợp lệ hoặc đã hết hạn.');
  const tokenDigest = digest(rawToken);
  return withUser(pool, '00000000-0000-4000-8000-000000000000', async (client) => {
    await client.query("SELECT set_config('app.invitation_digest', $1, true)", [tokenDigest.toString('hex')]);
    const found = await client.query(
      `SELECT id, store_id, email, email_normalized, role, invited_by, claimed_user_id, expires_at, accepted_at, revoked_at
       FROM store_invitations WHERE token_digest = $1 FOR UPDATE`,
      [tokenDigest]
    );
    if (!found.rowCount) throw new ApiError(404, 'invitation_unavailable', 'Lời mời không hợp lệ hoặc đã hết hạn.');
    await client.query("SELECT set_config('app.store_id', $1, true)", [found.rows[0].store_id]);
    return operation(client, found.rows[0]);
  });
}

function inviteUrl(env, token) {
  const url = new URL('/invite', env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000');
  url.hash = new URLSearchParams({ invite: token }).toString();
  return url.toString();
}

async function sendInvitation(env, invitation, token) {
  const url = inviteUrl(env, token);
  const roleNames = { manager: 'Quản lý', cashier: 'Thu ngân', stockkeeper: 'Nhân viên kho', accountant: 'Kế toán' };
  const text = `Bạn được mời tham gia cửa hàng ${invitation.store_name} trên Slink với vai trò ${roleNames[invitation.role]}. Lời mời có hiệu lực trong 7 ngày. Mở liên kết để tạo tài khoản hoặc đăng nhập và chấp nhận: ${url}`;
  return deliverEmail(env, invitation.email, `Lời mời tham gia ${invitation.store_name} trên Slink`, text, url);
}

async function createInvite(pool, auth, storeId, email, role) {
  const token = newToken();
  const tokenDigest = digest(token);
  let result;
  try {
    result = await withStore(pool, auth.userId, storeId, async (client, membership) => {
    assertOwner(membership);
    const normalized = email.toLowerCase();
    const existingMember = await client.query(
      `SELECT m.status FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.store_id = $1 AND u.email_normalized = $2`, [storeId, normalized]
    );
    if (existingMember.rowCount) throw new ApiError(409, 'already_member', 'Email này đã là thành viên của cửa hàng.');
    await client.query(
      `UPDATE store_invitations SET revoked_at = now(), updated_at = now()
       WHERE store_id = $1 AND email_normalized = $2 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at <= now()`,
      [storeId, normalized]
    );
    const inserted = await client.query(
      `INSERT INTO store_invitations (store_id, email, email_normalized, role, token_digest, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7::text || ' hours')::interval)
       RETURNING id, email, role, expires_at`,
      [storeId, email, normalized, role, tokenDigest, auth.userId, INVITE_HOURS]
    );
    const invitation = inserted.rows[0];
    await client.query(
      `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'staff.invited', 'store_invitation', $3, $4::jsonb)`,
      [storeId, auth.userId, invitation.id, JSON.stringify({ email: normalized, role })]
    );
    const store = await client.query('SELECT name FROM stores WHERE id = $1', [storeId]);
    return { ...invitation, store_name: store.rows[0].name };
    });
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'invitation_exists', 'Đang có lời mời cho email này. Hãy gửi lại lời mời hiện có.');
    throw error;
  }
  return { invitation: result, token };
}

async function sendOrRevoke(pool, auth, env, storeId, invitation, token) {
  try {
    const delivery = await sendInvitation(env, invitation, token);
    return { delivery, developmentInviteUrl: delivery.developmentUrl, invitation: { id: invitation.id, email: invitation.email, role: invitation.role, expires_at: invitation.expires_at } };
  } catch (error) {
    try {
      await withStore(pool, auth.userId, storeId, async (client, membership) => {
        assertOwner(membership);
        await client.query('UPDATE store_invitations SET revoked_at = now(), updated_at = now() WHERE id = $1 AND store_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL', [invitation.id, storeId]);
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, reason)
           VALUES ($1, $2, 'staff.invitation_delivery_failed', 'store_invitation', $3, 'Không gửi được thư mời; lời mời đã bị thu hồi.')`,
          [storeId, auth.userId, invitation.id]
        );
      });
    } catch { /* Keep the original delivery error; the invitation token itself is never returned. */ }
    throw error;
  }
}

function registerStaffRoutes(app, { pool, env }) {
  app.get('/api/invitations/:token', async (request) => {
    const result = await withInvitation(pool, request.params.token, async (client, invitation) => {
      const store = await client.query('SELECT name FROM stores WHERE id = $1 AND status = \'active\'', [invitation.store_id]);
      if (!store.rowCount) throw new ApiError(404, 'invitation_unavailable', 'Lời mời không còn hiệu lực.');
      const status = invitation.accepted_at ? 'accepted' : invitation.revoked_at ? 'revoked' : new Date(invitation.expires_at).getTime() <= Date.now() ? 'expired' : 'pending';
      return { id: invitation.id, email: invitation.email, role: invitation.role, storeName: store.rows[0].name, expiresAt: invitation.expires_at, status };
    });
    return { invitation: result };
  });

  app.post('/api/invitations/:token/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    assertSameOrigin(request, env);
    const displayName = typeof request.body?.displayName === 'string' ? request.body.displayName.trim() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    if (displayName.length < 2 || displayName.length > 120 || password.length < 12 || password.length > 128) {
      throw new ApiError(400, 'validation_error', 'Tên cần từ 2 ký tự và mật khẩu từ 12 đến 128 ký tự.');
    }
    const passwordHash = await hashPassword(password);
    const demoBypass = emailVerificationDisabled(env);
    const { verificationToken, invitation, userId } = await withInvitation(pool, request.params.token, async (client, current) => {
      if (!pending(current) || current.claimed_user_id) throw new ApiError(409, 'invitation_unavailable', 'Lời mời đã được sử dụng, thu hồi hoặc hết hạn.');
      const userId = require('node:crypto').randomUUID();
      try {
        await client.query(
          `INSERT INTO users (id, email, email_normalized, display_name, password_hash, status)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, current.email, current.email_normalized, displayName, passwordHash, demoBypass ? 'active' : 'pending']
        );
      } catch (error) {
        if (error.code === '23505') throw new ApiError(409, 'account_exists', 'Email này đã có tài khoản. Hãy đăng nhập để chấp nhận lời mời.');
        throw error;
      }
      await client.query('UPDATE store_invitations SET claimed_user_id = $2, updated_at = now() WHERE id = $1', [current.id, userId]);
      if (demoBypass) {
        await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
        const activeStore = await client.query("SELECT id FROM stores WHERE id = $1 AND status = 'active'", [current.store_id]);
        if (!activeStore.rowCount) throw new ApiError(409, 'store_unavailable', 'Cửa hàng này hiện không hoạt động.');
        await client.query(
          `INSERT INTO memberships (store_id,user_id,role,status,invited_by,joined_at)
           VALUES ($1,$2,$3,'active',$4,now())`,
          [current.store_id,userId,current.role,current.invited_by]
        );
        await client.query('UPDATE store_invitations SET accepted_at=now(),updated_at=now() WHERE id=$1', [current.id]);
        await client.query(`INSERT INTO audit_events (store_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES ($1,$2,'staff.joined','store_invitation',$3,$4::jsonb)`, [current.store_id,userId,current.id,JSON.stringify({role:current.role,acceptedDuring:'demo_registration'})]);
        return { verificationToken: null, invitation: current, userId };
      }
      const token = newToken();
      await client.query('INSERT INTO email_verification_tokens (user_id, token_digest, expires_at) VALUES ($1, $2, now() + interval \'24 hours\')', [userId, digest(token)]);
      return { verificationToken: token, invitation: { email: current.email, role: current.role, store_id: current.store_id }, userId };
    });
    if (demoBypass) {
      const session = await createUserSession(pool, userId, reply, env);
      return reply.code(201).send({ ...session, status: 'created_without_email_verification' });
    }
    const verificationUrl = new URL('/verify', env.PUBLIC_ORIGIN || 'http://127.0.0.1:3000');
    verificationUrl.hash = new URLSearchParams({ token: verificationToken }).toString();
    const delivery = await sendVerification(env, invitation.email, verificationUrl.toString());
    reply.code(201);
    return {
      status: 'verification_required',
      message: 'Tài khoản đã được tạo. Xác nhận email để kích hoạt quyền truy cập cửa hàng.',
      ...(delivery.developmentUrl ? { developmentVerificationUrl: delivery.developmentUrl } : {}),
    };
  });

  app.post('/api/invitations/:token/accept', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const result = await withUser(pool, auth.userId, async (client) => {
      const token = request.params.token;
      if (!validToken(token)) throw new ApiError(404, 'invitation_unavailable', 'Lời mời không hợp lệ hoặc đã hết hạn.');
      const tokenDigest = digest(token);
      await client.query("SELECT set_config('app.invitation_digest', $1, true)", [tokenDigest.toString('hex')]);
      const found = await client.query('SELECT * FROM store_invitations WHERE token_digest = $1 FOR UPDATE', [tokenDigest]);
      if (!found.rowCount) throw new ApiError(404, 'invitation_unavailable', 'Lời mời không hợp lệ hoặc đã hết hạn.');
      const invitation = found.rows[0];
      if (!pending(invitation)) throw new ApiError(409, 'invitation_unavailable', 'Lời mời đã được sử dụng, thu hồi hoặc hết hạn.');
      if (invitation.email_normalized !== auth.email.toLowerCase()) throw new ApiError(403, 'invitation_email_mismatch', 'Hãy đăng nhập bằng đúng email được mời.');
      if (invitation.claimed_user_id && invitation.claimed_user_id !== auth.userId) throw new ApiError(409, 'invitation_claimed', 'Lời mời này đã được dùng để tạo tài khoản khác.');
      await client.query("SELECT set_config('app.store_id', $1, true)", [invitation.store_id]);
      const store = await client.query("SELECT id FROM stores WHERE id = $1 AND status = 'active'", [invitation.store_id]);
      if (!store.rowCount) throw new ApiError(409, 'store_unavailable', 'Cửa hàng này hiện không hoạt động.');
      const existing = await client.query('SELECT status FROM memberships WHERE store_id = $1 AND user_id = $2 FOR UPDATE', [invitation.store_id, auth.userId]);
      if (existing.rowCount) throw new ApiError(409, 'already_member', 'Tài khoản đã là thành viên của cửa hàng.');
      await client.query(
        `INSERT INTO memberships (store_id, user_id, role, status, invited_by, joined_at)
         VALUES ($1, $2, $3, 'active', $4, now())`,
        [invitation.store_id, auth.userId, invitation.role, invitation.invited_by]
      );
      await client.query('UPDATE store_invitations SET claimed_user_id = $2, accepted_at = now(), updated_at = now() WHERE id = $1', [invitation.id, auth.userId]);
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'staff.joined', 'store_invitation', $3, $4::jsonb)`,
        [invitation.store_id, auth.userId, invitation.id, JSON.stringify({ role: invitation.role })]
      );
      return { storeId: invitation.store_id };
    });
    return { status: 'accepted', storeId: result.storeId };
  });

  app.get('/api/stores/:storeId/pos/sellers', async (request) => {
    const auth = await authenticate(pool, request);
    const storeId = request.params.storeId;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client) => {
      const res = await client.query(
        `SELECT m.user_id, u.display_name, m.role, m.staff_code
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.store_id = $1 AND m.status = 'active'
         ORDER BY (m.role = 'owner') DESC, m.created_at ASC, u.display_name ASC
         LIMIT 50`,
        [storeId]
      );
      return { sellers: res.rows };
    });
  });

  app.get('/api/stores/:storeId/staff', async (request) => {
    const auth = await authenticate(pool, request);
    const storeId = request.params.storeId;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      assertOwner(membership);
      const members = await client.query(
        `SELECT m.user_id, u.display_name, u.email, m.role, m.status, m.joined_at,
                COALESCE(m.permissions, '{}'::jsonb) AS permissions,
                m.staff_code, m.phone, COALESCE(m.job_title, '') AS job_title, COALESCE(m.note, '') AS note,
                COALESCE(m.commission_rate_bps, 0)::int AS commission_rate_bps,
                COALESCE(m.base_salary_vnd, 0)::text AS base_salary_vnd,
                COALESCE(m.salary_mode, 'monthly') AS salary_mode,
                COALESCE(m.standard_days_per_month, 26)::int AS standard_days_per_month,
                COALESCE(m.bank_bin, '') AS bank_bin,
                COALESCE(m.bank_account_number, '') AS bank_account_number,
                COALESCE(m.bank_account_owner, '') AS bank_account_owner,
                m.warehouse_scope_mode,
                COALESCE((SELECT json_agg(mws.warehouse_id ORDER BY mws.warehouse_id)
                          FROM membership_warehouse_scopes mws
                          JOIN warehouses w ON w.store_id = mws.store_id AND w.id = mws.warehouse_id AND w.status = 'active'
                          WHERE mws.store_id = m.store_id AND mws.user_id = m.user_id), '[]'::json) AS warehouse_scope_ids,
                COALESCE(perf.orders_count, 0)::int AS orders_count,
                COALESCE(perf.revenue_vnd, 0)::text AS revenue_vnd,
                ROUND(COALESCE(perf.revenue_vnd, 0) * COALESCE(m.commission_rate_bps, 0) / 10000.0)::bigint::text AS commission_vnd,
                COALESCE(shifts.shifts_count, 0)::int AS shifts_count,
                act.last_active_at
         FROM memberships m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS orders_count,
                  COALESCE(SUM(o.total_vnd - COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r
                    WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)), 0)::bigint AS revenue_vnd
           FROM orders o
           WHERE o.store_id = m.store_id AND COALESCE(o.seller_id, o.cashier_id) = m.user_id AND o.status <> 'voided'
         ) perf ON true
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS shifts_count
           FROM cash_register_sessions cs
           WHERE cs.store_id = m.store_id AND cs.opened_by = m.user_id
         ) shifts ON true
         LEFT JOIN LATERAL (
           SELECT MAX(ae.occurred_at) AS last_active_at
           FROM audit_events ae
           WHERE ae.store_id = m.store_id AND ae.actor_user_id = m.user_id
         ) act ON true
         WHERE m.store_id = $1 AND m.role <> 'owner'
         ORDER BY m.created_at, u.display_name LIMIT 200`, [storeId]
      );
      const invitations = await client.query(
        `SELECT id, email, role, expires_at, created_at, accepted_at, revoked_at,
           CASE WHEN accepted_at IS NOT NULL THEN 'accepted' WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN expires_at <= now() THEN 'expired' ELSE 'pending' END AS status
         FROM store_invitations WHERE store_id = $1 ORDER BY created_at DESC LIMIT 100`, [storeId]
      );
      const warehouses = await client.query(
        `SELECT id, code, name, is_default FROM warehouses WHERE store_id = $1 AND status = 'active'
         ORDER BY is_default DESC, name, id`, [storeId]
      );
      let totalTeamRevenue = 0n;
      let totalEstimatedPayout = 0n;
      let activeCount = 0;
      for (const row of members.rows) {
        if (row.status === 'active') activeCount += 1;
        totalTeamRevenue += BigInt(row.revenue_vnd || '0');
        totalEstimatedPayout += BigInt(row.base_salary_vnd || '0') + BigInt(row.commission_vnd || '0');
      }
      const enrichedMembers = members.rows.map((row) => {
        const permissions = normalizeStoredPermissions(row.permissions);
        return {
          ...row,
          permissions,
          effectivePermissions: resolveEffectivePermissions(row.role, permissions),
        };
      });
      return {
        members: enrichedMembers,
        invitations: invitations.rows,
        warehouses: warehouses.rows,
        roleDefaults: ROLE_DEFAULTS,
        summary: {
          totalStaff: enrichedMembers.length,
          activeStaff: activeCount,
          totalTeamRevenueVnd: totalTeamRevenue.toString(),
          totalEstimatedPayoutVnd: totalEstimatedPayout.toString(),
          pendingInvites: invitations.rows.filter((i) => i.status === 'pending').length,
        },
      };
    });
  });

  app.post('/api/stores/:storeId/staff/direct-create', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const storeId = request.params.storeId;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const body = request.body || {};
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const role = body.role;
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !STAFF_ROLES.has(role)) {
      throw new ApiError(400, 'validation_error', 'Hãy nhập email đăng nhập hợp lệ và chọn vai trò nhân viên.');
    }
    if (displayName.length < 2 || displayName.length > 120) {
      throw new ApiError(400, 'validation_error', 'Họ tên nhân viên cần từ 2 đến 120 ký tự.');
    }
    if (password.length < 12 || password.length > 128) {
      throw new ApiError(400, 'validation_error', 'Mật khẩu khởi tạo cần từ 12 đến 128 ký tự.');
    }
    const profile = validateStaffProfileFields(body, { partial: false });
    const permissions = body.permissions !== undefined ? validatePermissionsInput(body.permissions) : {};
    const effectivePermissions = resolveEffectivePermissions(role, permissions);
    const requestedScopeMode = body.warehouseScopeMode || 'all';
    const requestedWarehouseIds = body.warehouseIds;
    if (!['all', 'selected'].includes(requestedScopeMode)) {
      throw new ApiError(400, 'validation_error', 'Phạm vi kho không hợp lệ.');
    }
    if (role !== 'stockkeeper' && requestedScopeMode === 'selected') {
      throw new ApiError(400, 'validation_error', 'Chỉ nhân viên kho mới có thể được giới hạn theo kho.');
    }
    if (requestedWarehouseIds !== undefined && (!Array.isArray(requestedWarehouseIds) || requestedWarehouseIds.length > 500 || requestedWarehouseIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id)))) {
      throw new ApiError(400, 'validation_error', 'Danh sách kho được chọn không hợp lệ.');
    }
    const passwordHash = await hashPassword(password);
    const normalized = email.toLowerCase();

    const createdMember = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      assertOwner(membership);
      const existingMember = await client.query(
        `SELECT m.status FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.store_id = $1 AND u.email_normalized = $2`,
        [storeId, normalized]
      );
      if (existingMember.rowCount) {
        throw new ApiError(409, 'already_member', 'Email này đã là thành viên của cửa hàng.');
      }
      let warehouseIds = [];
      const scopeMode = role === 'stockkeeper' ? requestedScopeMode : 'all';
      if (scopeMode === 'selected') {
        warehouseIds = [...new Set((requestedWarehouseIds || []).map((id) => id.toLowerCase()))];
        if (warehouseIds.length < 1) throw new ApiError(400, 'warehouse_scope_required', 'Hãy chọn ít nhất một kho đang hoạt động cho nhân viên kho.');
        const validWarehouses = await client.query(
          `SELECT id FROM warehouses WHERE store_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`,
          [storeId, warehouseIds]
        );
        if (validWarehouses.rowCount !== warehouseIds.length) {
          throw new ApiError(400, 'warehouse_scope_invalid', 'Danh sách có kho không tồn tại hoặc đã lưu trữ.');
        }
      }
      let staffCode = profile.staffCode;
      if (!staffCode) {
        const countRes = await client.query(
          `SELECT GREATEST(COUNT(*), COALESCE(MAX(CASE WHEN staff_code ~ '^NV-[0-9]{1,9}$' THEN substring(staff_code FROM 4)::bigint END), 0))::int AS cnt
           FROM memberships WHERE store_id = $1 AND role <> 'owner'`,
          [storeId]
        );
        staffCode = `NV-${String((countRes.rows[0]?.cnt || 0) + 1).padStart(3, '0')}`;
      }
      const existingUser = await client.query(`SELECT id, status FROM users WHERE email_normalized = $1 FOR UPDATE`, [normalized]);
      if (existingUser.rowCount) {
        throw new ApiError(409, 'account_exists', 'Email này đã có tài khoản trên hệ thống. Hãy dùng tính năng Mời qua Email để nhân viên xác nhận tham gia cửa hàng.');
      }
      const userId = require('node:crypto').randomUUID();
      await client.query(
        `INSERT INTO users (id, email, email_normalized, display_name, password_hash, status, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, 'active', now())`,
        [userId, email, normalized, displayName, passwordHash]
      );
      try {
        await client.query(
          `INSERT INTO memberships (
             store_id, user_id, role, status, invited_by, joined_at,
             warehouse_scope_mode, staff_code, phone, job_title, note, commission_rate_bps, base_salary_vnd, permissions,
             salary_mode, standard_days_per_month, bank_bin, bank_account_number, bank_account_owner
           ) VALUES ($1, $2, $3, 'active', $4, now(), $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14, $15, $16, $17)`,
          [
            storeId, userId, role, auth.userId, scopeMode,
            staffCode, profile.phone, profile.jobTitle, profile.note,
            profile.commissionRateBps, profile.baseSalaryVnd, JSON.stringify(permissions),
            profile.salaryMode || 'monthly', profile.standardDaysPerMonth || 26,
            profile.bankBin || null, profile.bankAccountNumber || null, profile.bankAccountOwner || null,
          ]
        );
      } catch (err) {
        if (err.code === '23505') throw new ApiError(409, 'staff_code_conflict', 'Mã nhân viên này đã tồn tại trong cửa hàng.');
        throw err;
      }
      if (scopeMode === 'selected') {
        for (const warehouseId of warehouseIds) {
          await client.query(
            `INSERT INTO membership_warehouse_scopes (store_id, user_id, warehouse_id) VALUES ($1, $2, $3)`,
            [storeId, userId, warehouseId]
          );
        }
      }
      await client.query(
        `UPDATE store_invitations SET accepted_at = now(), claimed_user_id = $3, updated_at = now()
         WHERE store_id = $1 AND email_normalized = $2 AND accepted_at IS NULL AND revoked_at IS NULL`,
        [storeId, normalized, userId]
      );
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'staff.direct_created', 'membership', $3, $4::jsonb)`,
        [storeId, auth.userId, userId, JSON.stringify({ email: normalized, role, staffCode, jobTitle: profile.jobTitle, permissions, effectivePermissions })]
      );
      return {
        user_id: userId,
        display_name: displayName,
        email,
        role,
        status: 'active',
        permissions,
        effectivePermissions,
        staff_code: staffCode,
        phone: profile.phone,
        job_title: profile.jobTitle,
        note: profile.note,
        commission_rate_bps: profile.commissionRateBps,
        base_salary_vnd: profile.baseSalaryVnd,
        warehouse_scope_mode: scopeMode,
        warehouse_scope_ids: warehouseIds,
      };
    });
    return reply.code(201).send({ status: 'created', member: createdMember });
  });

  app.post('/api/stores/:storeId/staff/invitations', async (request, reply) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const storeId = request.params.storeId;
    const email = typeof request.body?.email === 'string' ? request.body.email.trim() : '';
    const role = request.body?.role;
    if (!UUID_PATTERN.test(storeId) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !STAFF_ROLES.has(role)) {
      throw new ApiError(400, 'validation_error', 'Hãy nhập email hợp lệ và chọn một vai trò nhân viên.');
    }
    const created = await createInvite(pool, auth, storeId, email, role);
    const delivery = await sendOrRevoke(pool, auth, env, storeId, created.invitation, created.token);
    reply.code(201);
    return { status: 'invited', message: delivery.delivery.delivered ? 'Đã gửi lời mời qua email.' : 'Đã tạo lời mời. Hãy chia sẻ liên kết trong môi trường phát triển.', ...delivery };
  });

  app.post('/api/stores/:storeId/staff/invitations/:invitationId/resend', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, invitationId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(invitationId)) throw new ApiError(400, 'validation_error', 'Lời mời không hợp lệ.');
    const token = newToken();
    const result = await withStore(pool, auth.userId, storeId, async (client, membership) => {
      assertOwner(membership);
      const found = await client.query('SELECT id, email, role, accepted_at, revoked_at FROM store_invitations WHERE id = $1 AND store_id = $2 FOR UPDATE', [invitationId, storeId]);
      if (!found.rowCount) throw new ApiError(404, 'not_found', 'Không tìm thấy lời mời.');
      const row = found.rows[0];
      if (row.accepted_at || row.revoked_at) throw new ApiError(409, 'invitation_unavailable', 'Lời mời này không còn chờ xử lý.');
      const refreshed = await client.query('UPDATE store_invitations SET token_digest = $2, expires_at = now() + interval \'7 days\', updated_at = now() WHERE id = $1 RETURNING expires_at', [invitationId, digest(token)]);
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id)
         VALUES ($1, $2, 'staff.invitation_resent', 'store_invitation', $3)`, [storeId, auth.userId, invitationId]
      );
      return { ...row, store_name: membership.store_name, expires_at: refreshed.rows[0].expires_at };
    });
    return sendOrRevoke(pool, auth, env, storeId, result, token);
  });

  app.post('/api/stores/:storeId/staff/invitations/:invitationId/revoke', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, invitationId } = request.params;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(invitationId)) throw new ApiError(400, 'validation_error', 'Lời mời không hợp lệ.');
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      assertOwner(membership);
      const found = await client.query('SELECT id, accepted_at, revoked_at FROM store_invitations WHERE id = $1 AND store_id = $2 FOR UPDATE', [invitationId, storeId]);
      if (!found.rowCount) throw new ApiError(404, 'not_found', 'Không tìm thấy lời mời.');
      if (!found.rows[0].accepted_at && !found.rows[0].revoked_at) {
        await client.query('UPDATE store_invitations SET revoked_at = now(), updated_at = now() WHERE id = $1', [invitationId]);
        await client.query(
          `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id)
           VALUES ($1, $2, 'staff.invitation_revoked', 'store_invitation', $3)`, [storeId, auth.userId, invitationId]
        );
      }
      return { status: 'revoked' };
    });
  });

  app.patch('/api/stores/:storeId/staff/members/:userId', async (request) => {
    const auth = await authenticate(pool, request);
    requireCsrf(request, env);
    const { storeId, userId } = request.params;
    const role = request.body?.role;
    const status = request.body?.status;
    const requestedScopeMode = request.body?.warehouseScopeMode;
    const requestedWarehouseIds = request.body?.warehouseIds;
    if (!UUID_PATTERN.test(storeId) || !UUID_PATTERN.test(userId) || !STAFF_ROLES.has(role) || !STAFF_STATUSES.has(status)) {
      throw new ApiError(400, 'validation_error', 'Vai trò hoặc trạng thái nhân viên không hợp lệ.');
    }
    if (requestedScopeMode !== undefined && !['all', 'selected'].includes(requestedScopeMode)) {
      throw new ApiError(400, 'validation_error', 'Phạm vi kho không hợp lệ.');
    }
    if (role !== 'stockkeeper' && requestedScopeMode === 'selected') {
      throw new ApiError(400, 'validation_error', 'Chỉ nhân viên kho mới có thể được giới hạn theo kho.');
    }
    if (requestedWarehouseIds !== undefined && (!Array.isArray(requestedWarehouseIds) || requestedWarehouseIds.length > 500 || requestedWarehouseIds.some((id) => typeof id !== 'string' || !UUID_PATTERN.test(id)))) {
      throw new ApiError(400, 'validation_error', 'Danh sách kho được chọn không hợp lệ.');
    }
    if (userId === auth.userId) throw new ApiError(409, 'self_change_forbidden', 'Chủ cửa hàng không thể tự thay đổi quyền của mình tại đây.');
    const requestedPermissions = request.body?.permissions !== undefined ? validatePermissionsInput(request.body.permissions) : undefined;
    const profileUpdates = validateStaffProfileFields(request.body || {}, { partial: true });
    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      assertOwner(membership);
      const found = await client.query(
        `SELECT m.user_id, m.role, m.status, m.warehouse_scope_mode,
                COALESCE(m.permissions, '{}'::jsonb) AS permissions,
                m.staff_code, m.phone, m.job_title, m.note, m.commission_rate_bps, m.base_salary_vnd::text AS base_salary_vnd,
                COALESCE(m.salary_mode, 'monthly') AS salary_mode,
                COALESCE(m.standard_days_per_month, 26)::int AS standard_days_per_month,
                m.bank_bin, m.bank_account_number, m.bank_account_owner,
                u.email, u.display_name
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.store_id = $1 AND m.user_id = $2 FOR UPDATE OF m`, [storeId, userId]
      );
      if (!found.rowCount) throw new ApiError(404, 'not_found', 'Không tìm thấy nhân viên.');
      if (found.rows[0].role === 'owner') throw new ApiError(409, 'owner_protected', 'Quyền chủ cửa hàng không thể thay đổi bằng màn hình nhân viên.');
      const current = found.rows[0];
      const scopeMode = role === 'stockkeeper'
        ? (requestedScopeMode ?? (current.role === 'stockkeeper' ? current.warehouse_scope_mode : 'all'))
        : 'all';
      let warehouseIds = [];
      if (scopeMode === 'selected') {
        if (requestedWarehouseIds !== undefined) {
          warehouseIds = [...new Set(requestedWarehouseIds.map((id) => id.toLowerCase()))];
        } else if (current.role === 'stockkeeper' && current.warehouse_scope_mode === 'selected') {
          const existingScopes = await client.query(
            `SELECT mws.warehouse_id FROM membership_warehouse_scopes mws
             JOIN warehouses w ON w.store_id = mws.store_id AND w.id = mws.warehouse_id AND w.status = 'active'
             WHERE mws.store_id = $1 AND mws.user_id = $2 ORDER BY mws.warehouse_id`, [storeId, userId]
          );
          warehouseIds = existingScopes.rows.map((row) => row.warehouse_id);
        }
        if (warehouseIds.length < 1) throw new ApiError(400, 'warehouse_scope_required', 'Hãy chọn ít nhất một kho đang hoạt động cho nhân viên kho.');
        const validWarehouses = await client.query(
          `SELECT id FROM warehouses WHERE store_id = $1 AND status = 'active' AND id = ANY($2::uuid[])`,
          [storeId, warehouseIds]
        );
        if (validWarehouses.rowCount !== warehouseIds.length) throw new ApiError(400, 'warehouse_scope_invalid', 'Danh sách có kho không tồn tại hoặc đã lưu trữ. Tải lại danh sách kho rồi thử lại.');
      }
      const nextStaffCode = profileUpdates.staffCode !== undefined ? profileUpdates.staffCode : current.staff_code;
      const nextPhone = profileUpdates.phone !== undefined ? profileUpdates.phone : current.phone;
      const nextJobTitle = profileUpdates.jobTitle !== undefined ? profileUpdates.jobTitle : (current.job_title || '');
      const nextNote = profileUpdates.note !== undefined ? profileUpdates.note : (current.note || '');
      const nextCommissionBps = profileUpdates.commissionRateBps !== undefined ? profileUpdates.commissionRateBps : (current.commission_rate_bps || 0);
      const nextBaseSalaryVnd = profileUpdates.baseSalaryVnd !== undefined ? profileUpdates.baseSalaryVnd : (current.base_salary_vnd || '0');
      const nextSalaryMode = profileUpdates.salaryMode !== undefined ? profileUpdates.salaryMode : (current.salary_mode || 'monthly');
      const nextStandardDays = profileUpdates.standardDaysPerMonth !== undefined ? profileUpdates.standardDaysPerMonth : (current.standard_days_per_month || 26);
      const nextBankBin = profileUpdates.bankBin !== undefined ? profileUpdates.bankBin : current.bank_bin;
      const nextBankAccountNumber = profileUpdates.bankAccountNumber !== undefined ? profileUpdates.bankAccountNumber : current.bank_account_number;
      const nextBankAccountOwner = profileUpdates.bankAccountOwner !== undefined ? profileUpdates.bankAccountOwner : current.bank_account_owner;
      const previousPermissions = normalizeStoredPermissions(current.permissions);
      const nextPermissions = requestedPermissions !== undefined
        ? requestedPermissions
        : (role !== current.role ? {} : previousPermissions);
      const nextEffectivePermissions = resolveEffectivePermissions(role, nextPermissions);
      try {
        await client.query(
          `UPDATE memberships
           SET role = $3, status = $4, warehouse_scope_mode = $5,
               staff_code = $6, phone = $7, job_title = $8, note = $9,
               commission_rate_bps = $10, base_salary_vnd = $11, permissions = $12::jsonb,
               salary_mode = $13, standard_days_per_month = $14,
               bank_bin = $15, bank_account_number = $16, bank_account_owner = $17
           WHERE store_id = $1 AND user_id = $2`,
          [
            storeId, userId, role, status, scopeMode, nextStaffCode, nextPhone, nextJobTitle, nextNote,
            nextCommissionBps, nextBaseSalaryVnd, JSON.stringify(nextPermissions),
            nextSalaryMode, nextStandardDays, nextBankBin, nextBankAccountNumber, nextBankAccountOwner,
          ]
        );
      } catch (err) {
        if (err.code === '23505') throw new ApiError(409, 'staff_code_conflict', 'Mã nhân viên này đã tồn tại trong cửa hàng.');
        throw err;
      }
      if (profileUpdates.displayName && profileUpdates.displayName !== current.display_name) {
        const otherStores = await client.query(`SELECT 1 FROM memberships WHERE user_id = $1 AND store_id <> $2 LIMIT 1`, [userId, storeId]);
        if (!otherStores.rowCount) {
          await client.query(`UPDATE users SET display_name = $2, updated_at = now() WHERE id = $1`, [userId, profileUpdates.displayName]);
        }
      }
      await client.query('DELETE FROM membership_warehouse_scopes WHERE store_id = $1 AND user_id = $2', [storeId, userId]);
      if (scopeMode === 'selected') {
        for (const warehouseId of warehouseIds) {
          await client.query(
            `INSERT INTO membership_warehouse_scopes (store_id, user_id, warehouse_id) VALUES ($1, $2, $3)`,
            [storeId, userId, warehouseId]
          );
        }
      }
      await client.query(
        `INSERT INTO audit_events (store_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'staff.access_changed', 'membership', $3, $4::jsonb)`,
        [storeId, auth.userId, userId, JSON.stringify({
          email: current.email,
          previousRole: current.role,
          previousStatus: current.status,
          previousWarehouseScopeMode: current.warehouse_scope_mode,
          previousPermissions,
          role,
          status,
          warehouseScopeMode: scopeMode,
          warehouseIds,
          permissions: nextPermissions,
          effectivePermissions: nextEffectivePermissions,
        })]
      );
      return { status: 'updated', permissions: nextPermissions, effectivePermissions: nextEffectivePermissions };
    });
  });
}

module.exports = { registerStaffRoutes };
