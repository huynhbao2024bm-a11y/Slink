'use strict';

const { ApiError, authenticate } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { hasPermission, requirePermission } = require('./rbac');
const { allowedWarehouseIds } = require('./warehouse-access');

function parseCalendarDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'validation_error', `${label} phải có định dạng YYYY-MM-DD.`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime()) || dt.getUTCFullYear() !== y || dt.getUTCMonth() + 1 !== m || dt.getUTCDate() !== d) {
    throw new ApiError(400, 'validation_error', `${label} không phải ngày hợp lệ.`);
  }
  return { text: value, ms: dt.getTime() };
}

function resolveAnalyticsWindow(query) {
  const hasFrom = query?.from !== undefined && query.from !== '';
  const hasTo = query?.to !== undefined && query.to !== '';
  if (hasFrom !== hasTo) {
    throw new ApiError(400, 'validation_error', 'Cần truyền đầy đủ cả ngày bắt đầu (from) và ngày kết thúc (to).');
  }
  if (hasFrom && hasTo) {
    const from = parseCalendarDate(query.from, 'Ngày bắt đầu');
    const to = parseCalendarDate(query.to, 'Ngày kết thúc');
    if (from.ms > to.ms) {
      throw new ApiError(400, 'validation_error', 'Ngày bắt đầu không được lớn hơn ngày kết thúc.');
    }
    const span = Math.round((to.ms - from.ms) / 86_400_000) + 1;
    if (span > 366) {
      throw new ApiError(400, 'validation_error', 'Khoảng thời gian báo cáo tối đa 366 ngày.');
    }
    return { custom: true, from: from.text, to: to.text, days: span };
  }
  const requestedDays = Number(query?.days);
  const days = [1, 7, 30].includes(requestedDays) ? requestedDays : 7;
  return { custom: false, from: null, to: null, days };
}

function buildBoundsCte(win) {
  if (win.custom) {
    return `bounds AS (
      SELECT timezone,
             $2::date AS start_date,
             $3::date AS end_date,
             ($2::date - $4::int) AS prev_start_date,
             ($2::date - 1) AS prev_end_date
      FROM stores WHERE id = $1
    )`;
  }
  return `bounds AS (
    SELECT timezone,
           ((now() AT TIME ZONE timezone)::date - ($2::int - 1)) AS start_date,
           (now() AT TIME ZONE timezone)::date AS end_date,
           ((now() AT TIME ZONE timezone)::date - ($2::int * 2 - 1)) AS prev_start_date,
           ((now() AT TIME ZONE timezone)::date - $2::int) AS prev_end_date
    FROM stores WHERE id = $1
  )`;
}

function registerAnalyticsRoutes(app, { pool }) {
  app.get('/api/stores/:storeId/analytics', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    const win = resolveAnalyticsWindow(request.query);
    const boundsCte = buildBoundsCte(win);

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      requirePermission(membership, 'view_reports', 'Tài khoản này không có quyền xem báo cáo tài chính.');
      const canViewCost = hasPermission(membership, 'view_cost_price');
      const allowedIds = allowedWarehouseIds(membership);
      const scoped = allowedIds !== null;
      const boundsParams = win.custom ? [storeId, win.from, win.to, win.days] : [storeId, win.days];
      const cashParams = [...boundsParams, scoped];
      const orderParams = [...boundsParams, scoped, allowedIds || []];
      const scopedIdx = boundsParams.length + 1;
      const whIdx = boundsParams.length + 2;
      const orderWhClause = ` AND ($${scopedIdx}::boolean = false OR o.warehouse_id = ANY($${whIdx}::uuid[]))`;
      const cashWhClause = ` AND $${scopedIdx}::boolean = false`;
      const queries = [
        () => client.query(
          `WITH ${boundsCte}, scoped AS (
             SELECT o.id, o.total_vnd, o.occurred_at,
                    COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::bigint AS returned_vnd,
                    COALESCE((SELECT SUM(p.amount_vnd) FROM payments p WHERE p.store_id = o.store_id AND p.order_id = o.id AND p.status = 'succeeded'), 0)::bigint AS paid_vnd,
                    COALESCE((SELECT SUM(f.amount_vnd) FROM refunds f JOIN returns r ON r.store_id = f.store_id AND r.id = f.return_id
                              WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed' AND f.status = 'succeeded'), 0)::bigint AS refunded_vnd
             FROM orders o CROSS JOIN bounds b
             WHERE o.store_id = $1 AND o.status <> 'voided'
               AND o.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND o.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           ), margin AS (
             SELECT COALESCE(ROUND(SUM(ol.line_total_vnd - COALESCE(r.returned_vnd, 0)
                       - (ol.unit_cost_vnd * ol.quantity)
                       + COALESCE(r.restocked_cost_vnd, 0))), 0)::bigint::text AS gross_profit_vnd
             FROM scoped o JOIN order_lines ol ON ol.store_id = $1 AND ol.order_id = o.id
             LEFT JOIN LATERAL (
               SELECT SUM(rl.refund_vnd)::bigint AS returned_vnd,
                      SUM(rl.restocked_quantity * ol.unit_cost_vnd)::numeric AS restocked_cost_vnd
               FROM return_lines rl JOIN returns ret ON ret.store_id = rl.store_id AND ret.id = rl.return_id
               WHERE rl.store_id = ol.store_id AND rl.order_line_id = ol.id AND ret.status = 'completed'
             ) r ON true
           )
           SELECT COUNT(*)::int AS order_count,
                  COALESCE(SUM(total_vnd - returned_vnd), 0)::text AS net_sales_vnd,
                  COALESCE(SUM(total_vnd), 0)::text AS gross_sales_vnd,
                  COALESCE(SUM(paid_vnd - refunded_vnd), 0)::text AS collected_vnd,
                  COALESCE(SUM(GREATEST(total_vnd - returned_vnd - paid_vnd + refunded_vnd, 0)), 0)::text AS receivable_vnd,
                  COALESCE(ROUND(AVG(total_vnd - returned_vnd)), 0)::bigint::text AS average_ticket_vnd,
                  (SELECT gross_profit_vnd FROM margin) AS gross_profit_vnd,
                  (SELECT start_date::text FROM bounds) AS start_date,
                  (SELECT end_date::text FROM bounds) AS end_date
           FROM scoped`,
          orderParams
        ),
        () => client.query(
          `WITH ${boundsCte}, dates AS (
             SELECT generate_series(start_date::timestamp, end_date::timestamp, interval '1 day')::date AS day, timezone FROM bounds
           ), scoped AS (
             SELECT o.id, o.store_id, o.total_vnd, o.occurred_at,
                    COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::bigint AS returned_vnd
             FROM orders o CROSS JOIN bounds b
             WHERE o.store_id = $1 AND o.status <> 'voided'
               AND o.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND o.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           )
           SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
                  COALESCE(SUM(o.total_vnd - o.returned_vnd), 0)::text AS sales_vnd,
                  COUNT(o.id)::int AS order_count
           FROM dates d LEFT JOIN scoped o ON (o.occurred_at AT TIME ZONE d.timezone)::date = d.day
           GROUP BY d.day ORDER BY d.day`,
          orderParams
        ),
        () => client.query(
          `WITH ${boundsCte}
           SELECT p.id, p.name, p.sku, p.unit,
                  COALESCE(SUM(ol.quantity - COALESCE(returns.returned_quantity, 0)), 0)::text AS quantity_sold,
                  COALESCE(SUM(ol.line_total_vnd - COALESCE(returns.returned_vnd, 0)), 0)::text AS net_sales_vnd
           FROM orders o JOIN order_lines ol ON ol.store_id = o.store_id AND ol.order_id = o.id
           JOIN products p ON p.store_id = ol.store_id AND p.id = ol.product_id
           CROSS JOIN bounds
           LEFT JOIN LATERAL (
             SELECT SUM(rl.quantity)::numeric AS returned_quantity, SUM(rl.refund_vnd)::bigint AS returned_vnd
             FROM return_lines rl JOIN returns r ON r.store_id = rl.store_id AND r.id = rl.return_id
             WHERE rl.store_id = ol.store_id AND rl.order_line_id = ol.id AND r.status = 'completed'
           ) returns ON true
           WHERE o.store_id = $1 AND o.status <> 'voided'
             AND o.occurred_at >= (bounds.start_date::timestamp AT TIME ZONE bounds.timezone)
             AND o.occurred_at < ((bounds.end_date + 1)::timestamp AT TIME ZONE bounds.timezone)${orderWhClause}
           GROUP BY p.id, p.name, p.sku, p.unit
           ORDER BY SUM(ol.line_total_vnd - COALESCE(returns.returned_vnd, 0)) DESC, p.name LIMIT 10`,
          orderParams
        ),
        () => client.query(
          `WITH ${boundsCte}, pnl_rows AS (
             SELECT COALESCE(orig.direction, c.direction) AS eff_dir,
                    c.category,
                    CASE WHEN c.movement_kind = 'reversal' THEN -c.amount_vnd ELSE c.amount_vnd END AS signed_vnd
             FROM cash_movements c
             CROSS JOIN bounds b
             LEFT JOIN cash_movements orig ON orig.store_id = c.store_id AND orig.id = c.reverses_movement_id
             WHERE c.store_id = $1
               AND c.include_in_pnl = true
               AND c.movement_kind <> 'transfer'
               AND c.transfer_group_id IS NULL
               AND c.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND c.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${cashWhClause}
           )
           SELECT
             COALESCE(SUM(signed_vnd) FILTER (WHERE eff_dir = 'in'), 0)::text AS other_income_vnd,
             COALESCE(SUM(signed_vnd) FILTER (WHERE eff_dir = 'out'), 0)::text AS operating_expense_vnd
           FROM pnl_rows`,
          cashParams
        ),
        () => client.query(
          `WITH ${boundsCte}
           SELECT c.category,
                  COALESCE(SUM(CASE WHEN c.movement_kind = 'reversal' THEN -c.amount_vnd ELSE c.amount_vnd END), 0)::text AS amount_vnd
           FROM cash_movements c
           CROSS JOIN bounds b
           LEFT JOIN cash_movements orig ON orig.store_id = c.store_id AND orig.id = c.reverses_movement_id
           WHERE c.store_id = $1
             AND c.include_in_pnl = true
             AND c.movement_kind <> 'transfer'
             AND c.transfer_group_id IS NULL
             AND COALESCE(orig.direction, c.direction) = 'out'
             AND c.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
             AND c.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${cashWhClause}
           GROUP BY c.category
           HAVING SUM(CASE WHEN c.movement_kind = 'reversal' THEN -c.amount_vnd ELSE c.amount_vnd END) > 0
           ORDER BY SUM(CASE WHEN c.movement_kind = 'reversal' THEN -c.amount_vnd ELSE c.amount_vnd END) DESC, c.category
           LIMIT 10`,
          cashParams
        ),
        () => client.query(
          `WITH ${boundsCte}, prev_scoped AS (
             SELECT o.id, o.total_vnd,
                    COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::bigint AS returned_vnd
             FROM orders o CROSS JOIN bounds b
             WHERE o.store_id = $1 AND o.status <> 'voided'
               AND o.occurred_at >= (b.prev_start_date::timestamp AT TIME ZONE b.timezone)
               AND o.occurred_at < ((b.prev_end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           ), prev_margin AS (
             SELECT COALESCE(ROUND(SUM(ol.line_total_vnd - COALESCE(r.returned_vnd, 0)
                       - (ol.unit_cost_vnd * ol.quantity)
                       + COALESCE(r.restocked_cost_vnd, 0))), 0)::bigint::text AS gross_profit_vnd
             FROM prev_scoped o JOIN order_lines ol ON ol.store_id = $1 AND ol.order_id = o.id
             LEFT JOIN LATERAL (
               SELECT SUM(rl.refund_vnd)::bigint AS returned_vnd,
                      SUM(rl.restocked_quantity * ol.unit_cost_vnd)::numeric AS restocked_cost_vnd
               FROM return_lines rl JOIN returns ret ON ret.store_id = rl.store_id AND ret.id = rl.return_id
               WHERE rl.store_id = ol.store_id AND rl.order_line_id = ol.id AND ret.status = 'completed'
             ) r ON true
           )
           SELECT COUNT(*)::int AS order_count,
                  COALESCE(SUM(total_vnd - returned_vnd), 0)::text AS net_sales_vnd,
                  (SELECT gross_profit_vnd FROM prev_margin) AS gross_profit_vnd
           FROM prev_scoped`,
          orderParams
        ),
        () => client.query(
          `WITH ${boundsCte}
           SELECT p.method, COALESCE(SUM(p.amount_vnd), 0)::text AS amount_vnd
           FROM payments p
           JOIN orders o ON o.store_id = p.store_id AND o.id = p.order_id
           CROSS JOIN bounds b
           WHERE p.store_id = $1 AND p.status = 'succeeded'
             AND p.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
             AND p.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           GROUP BY p.method`,
          orderParams
        ),
        () => client.query(
          `WITH ${boundsCte}, order_stats AS (
             SELECT COUNT(*) FILTER (WHERE o.status <> 'voided')::int AS completed_orders,
                    COUNT(*) FILTER (WHERE o.status = 'voided')::int AS voided_orders
             FROM orders o CROSS JOIN bounds b
             WHERE o.store_id = $1
               AND o.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND o.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           ), return_stats AS (
             SELECT COUNT(*)::int AS returned_orders,
                    COALESCE(SUM(r.refund_total_vnd), 0)::text AS returned_vnd
             FROM returns r
             JOIN orders o ON o.store_id = r.store_id AND o.id = r.order_id
             CROSS JOIN bounds b
             WHERE r.store_id = $1 AND r.status = 'completed'
               AND r.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND r.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           ), cash_stats AS (
             SELECT COALESCE(SUM(CASE WHEN c.movement_kind = 'reversal' THEN -c.amount_vnd ELSE c.amount_vnd END)
                             FILTER (WHERE COALESCE(orig.direction, c.direction) = 'in'), 0)::text AS cash_inflow_vnd,
                    COALESCE(SUM(CASE WHEN c.movement_kind = 'reversal' THEN -c.amount_vnd ELSE c.amount_vnd END)
                             FILTER (WHERE COALESCE(orig.direction, c.direction) = 'out'), 0)::text AS cash_outflow_vnd
             FROM cash_movements c CROSS JOIN bounds b
             LEFT JOIN cash_movements orig ON orig.store_id = c.store_id AND orig.id = c.reverses_movement_id
             WHERE c.store_id = $1 AND c.movement_kind <> 'transfer'
               AND c.transfer_group_id IS NULL
               AND c.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND c.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${cashWhClause}
           )
           SELECT o.completed_orders, o.voided_orders,
                  r.returned_orders, r.returned_vnd,
                  c.cash_inflow_vnd, c.cash_outflow_vnd
           FROM order_stats o, return_stats r, cash_stats c`,
          orderParams
        ),
        () => client.query(
          `WITH ${boundsCte}
           SELECT COALESCE(NULLIF(btrim(p.category), ''), 'Chưa phân loại') AS category,
                  COALESCE(SUM(ol.quantity - COALESCE(returns.returned_quantity, 0)), 0)::text AS quantity_sold,
                  COALESCE(SUM(ol.line_total_vnd - COALESCE(returns.returned_vnd, 0)), 0)::text AS net_sales_vnd,
                  COALESCE(ROUND(SUM(ol.line_total_vnd - COALESCE(returns.returned_vnd, 0)
                    - (ol.unit_cost_vnd * ol.quantity) + COALESCE(returns.restocked_cost_vnd, 0))), 0)::bigint::text AS gross_profit_vnd
           FROM orders o JOIN order_lines ol ON ol.store_id = o.store_id AND ol.order_id = o.id
           JOIN products p ON p.store_id = ol.store_id AND p.id = ol.product_id
           CROSS JOIN bounds b
           LEFT JOIN LATERAL (
             SELECT SUM(rl.quantity)::numeric AS returned_quantity,
                    SUM(rl.refund_vnd)::bigint AS returned_vnd,
                    SUM(rl.restocked_quantity * ol.unit_cost_vnd)::numeric AS restocked_cost_vnd
             FROM return_lines rl JOIN returns r ON r.store_id = rl.store_id AND r.id = rl.return_id
             WHERE rl.store_id = ol.store_id AND rl.order_line_id = ol.id AND r.status = 'completed'
           ) returns ON true
           WHERE o.store_id = $1 AND o.status <> 'voided'
             AND o.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
             AND o.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           GROUP BY COALESCE(NULLIF(btrim(p.category), ''), 'Chưa phân loại')
           ORDER BY SUM(ol.line_total_vnd - COALESCE(returns.returned_vnd, 0)) DESC, category
           LIMIT 12`,
          orderParams
        ),
        () => client.query(
          `WITH ${boundsCte}, scoped_staff AS (
             SELECT COALESCE(o.seller_id, o.cashier_id) AS staff_user_id,
                    o.total_vnd,
                    COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::bigint AS returned_vnd
             FROM orders o CROSS JOIN bounds b
             WHERE o.store_id = $1 AND o.status <> 'voided'
               AND o.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND o.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)${orderWhClause}
           )
           SELECT s.staff_user_id AS user_id,
                  COALESCE(u.display_name, 'Nhân viên') AS name,
                  COUNT(*)::int AS order_count,
                  COALESCE(SUM(s.total_vnd - s.returned_vnd), 0)::text AS net_sales_vnd
           FROM scoped_staff s
           LEFT JOIN users u ON u.id = s.staff_user_id
           GROUP BY s.staff_user_id, u.display_name
           ORDER BY SUM(s.total_vnd - s.returned_vnd) DESC, name
           LIMIT 12`,
          orderParams
        ),
      ];
      // These statements share the transaction-bound client; do not overlap client.query calls.
      const results = [];
      for (const query of queries) results.push(await query());
      const [summary, daily, topProducts, pnlSummary, expenseBreakdown, prevRes, payRes, eodRes, catRes, staffRes] = results;
      const row = summary.rows[0];
      const pnlRow = pnlSummary.rows[0] || { other_income_vnd: '0', operating_expense_vnd: '0' };
      const grossProfitVnd = String(row.gross_profit_vnd || '0').split('.')[0] || '0';
      const netProfitVnd = (BigInt(grossProfitVnd) + BigInt(pnlRow.other_income_vnd || '0') - BigInt(pnlRow.operating_expense_vnd || '0')).toString();

      const prevRow = prevRes.rows[0] || { order_count: 0, net_sales_vnd: '0', gross_profit_vnd: '0' };
      const prevGrossProfitVnd = String(prevRow.gross_profit_vnd || '0').split('.')[0] || '0';
      const currSales = BigInt(row.net_sales_vnd || '0');
      const prevSales = BigInt(prevRow.net_sales_vnd || '0');
      let salesGrowthPct = null;
      if (prevSales > 0n) {
        const diffTenths = Number(((currSales - prevSales) * 1000n) / prevSales);
        salesGrowthPct = Math.round(diffTenths) / 10;
      } else if (currSales > 0n) {
        salesGrowthPct = 100;
      }

      const paymentBreakdown = {
        cash: '0',
        bank_transfer: '0',
        bank_qr: '0',
        card: '0',
        other: '0',
        receivableVnd: row.receivable_vnd,
      };
      for (const payRow of payRes.rows) {
        if (Object.prototype.hasOwnProperty.call(paymentBreakdown, payRow.method)) {
          paymentBreakdown[payRow.method] = payRow.amount_vnd;
        }
      }

      const eodRow = eodRes.rows[0] || {
        completed_orders: 0,
        voided_orders: 0,
        returned_orders: 0,
        returned_vnd: '0',
        cash_inflow_vnd: '0',
        cash_outflow_vnd: '0',
      };
      const netCashflowVnd = (BigInt(eodRow.cash_inflow_vnd || '0') - BigInt(eodRow.cash_outflow_vnd || '0')).toString();

      return {
        range: { from: row.start_date, to: row.end_date, days: win.days },
        summary: {
          orderCount: Number(row.order_count),
          netSalesVnd: row.net_sales_vnd,
          grossSalesVnd: row.gross_sales_vnd,
          collectedVnd: row.collected_vnd,
          receivableVnd: row.receivable_vnd,
          averageTicketVnd: row.average_ticket_vnd,
          grossProfitVnd: canViewCost ? grossProfitVnd : null,
          otherIncomeVnd: pnlRow.other_income_vnd,
          operatingExpenseVnd: pnlRow.operating_expense_vnd,
          netProfitVnd: canViewCost ? netProfitVnd : null,
        },
        previousSummary: {
          orderCount: Number(prevRow.order_count),
          netSalesVnd: prevRow.net_sales_vnd,
          grossProfitVnd: canViewCost ? prevGrossProfitVnd : null,
          salesGrowthPct,
        },
        paymentBreakdown,
        endOfDay: {
          completedOrders: Number(eodRow.completed_orders),
          voidedOrders: Number(eodRow.voided_orders),
          returnedOrders: Number(eodRow.returned_orders),
          returnedVnd: eodRow.returned_vnd,
          cashInflowVnd: eodRow.cash_inflow_vnd,
          cashOutflowVnd: eodRow.cash_outflow_vnd,
          netCashflowVnd,
        },
        expenseBreakdown: expenseBreakdown.rows.map((item) => ({ category: item.category, amountVnd: item.amount_vnd })),
        days: daily.rows.map((item) => ({ date: item.day, salesVnd: item.sales_vnd, orderCount: Number(item.order_count) })),
        topProducts: topProducts.rows,
        byCategory: catRes.rows.map((item) => ({
          category: item.category,
          quantitySold: item.quantity_sold,
          netSalesVnd: item.net_sales_vnd,
          grossProfitVnd: canViewCost ? (String(item.gross_profit_vnd || '0').split('.')[0] || '0') : null,
        })),
        byStaff: staffRes.rows.map((item) => ({
          userId: item.user_id,
          name: item.name,
          orderCount: Number(item.order_count),
          netSalesVnd: item.net_sales_vnd,
        })),
      };
    });
  });
}

module.exports = { registerAnalyticsRoutes };
