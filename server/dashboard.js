'use strict';

const { ApiError, authenticate } = require('./auth');
const { UUID_PATTERN, withStore } = require('./db');
const { hasPermission } = require('./rbac');
const { allowedWarehouseIds } = require('./warehouse-access');

function registerDashboardRoutes(app, { pool }) {
  app.get('/api/stores/:storeId/dashboard', async (request) => {
    const auth = await authenticate(pool, request);
    const { storeId } = request.params;
    if (!UUID_PATTERN.test(storeId)) {
      throw new ApiError(400, 'validation_error', 'Cửa hàng không hợp lệ.');
    }

    return withStore(pool, auth.userId, storeId, async (client, membership) => {
      const isOwner = membership.role === 'owner';
      const canViewRevenue = isOwner || hasPermission(membership, 'view_reports');
      const canViewFunds = isOwner || hasPermission(membership, 'view_reports') || hasPermission(membership, 'record_cashbook');
      const canViewNetProfit = isOwner || (hasPermission(membership, 'view_reports') && hasPermission(membership, 'view_cost_price'));
      const canViewDebt = membership.role !== 'stockkeeper'
        && (isOwner || hasPermission(membership, 'view_reports') || hasPermission(membership, 'record_cashbook'));
      const canViewShift = membership.role !== 'stockkeeper';
      const canViewRecentOrders = membership.role !== 'stockkeeper';

      let todayRevenueVnd = null;
      let todayOrderCount = null;
      let todayNetProfitVnd = null;

      // All queries share the transaction-bound client and MUST run sequentially.
      if (canViewRevenue) {
        const salesRes = await client.query(
          `WITH bounds AS (
             SELECT timezone, (now() AT TIME ZONE timezone)::date AS end_date,
                    (now() AT TIME ZONE timezone)::date AS start_date
             FROM stores WHERE id = $1
           ), scoped AS (
             SELECT o.id, o.total_vnd,
                    COALESCE((SELECT SUM(r.refund_total_vnd) FROM returns r WHERE r.store_id = o.store_id AND r.order_id = o.id AND r.status = 'completed'), 0)::bigint AS returned_vnd
             FROM orders o CROSS JOIN bounds b
             WHERE o.store_id = $1 AND o.status <> 'voided'
               AND o.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
               AND o.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)
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
                  (SELECT gross_profit_vnd FROM margin) AS gross_profit_vnd
           FROM scoped`,
          [storeId]
        );
        const salesRow = salesRes.rows[0] || { order_count: 0, net_sales_vnd: '0', gross_profit_vnd: '0' };
        todayRevenueVnd = String(salesRow.net_sales_vnd || '0');
        todayOrderCount = Number(salesRow.order_count || 0);

        if (canViewNetProfit) {
          const pnlRes = await client.query(
            `WITH bounds AS (
               SELECT timezone, (now() AT TIME ZONE timezone)::date AS end_date,
                      (now() AT TIME ZONE timezone)::date AS start_date
               FROM stores WHERE id = $1
             ), pnl_rows AS (
               SELECT COALESCE(orig.direction, c.direction) AS eff_dir,
                      CASE WHEN c.movement_kind = 'reversal' THEN -c.amount_vnd ELSE c.amount_vnd END AS signed_vnd
               FROM cash_movements c
               CROSS JOIN bounds b
               LEFT JOIN cash_movements orig ON orig.store_id = c.store_id AND orig.id = c.reverses_movement_id
               WHERE c.store_id = $1
                 AND c.include_in_pnl = true
                 AND c.movement_kind <> 'transfer'
                 AND c.occurred_at >= (b.start_date::timestamp AT TIME ZONE b.timezone)
                 AND c.occurred_at < ((b.end_date + 1)::timestamp AT TIME ZONE b.timezone)
             )
             SELECT
               COALESCE(SUM(signed_vnd) FILTER (WHERE eff_dir = 'in'), 0)::text AS other_income_vnd,
               COALESCE(SUM(signed_vnd) FILTER (WHERE eff_dir = 'out'), 0)::text AS operating_expense_vnd
             FROM pnl_rows`,
            [storeId]
          );
          const pnlRow = pnlRes.rows[0] || { other_income_vnd: '0', operating_expense_vnd: '0' };
          const grossProfitVnd = String(salesRow.gross_profit_vnd || '0').split('.')[0] || '0';
          todayNetProfitVnd = (
            BigInt(grossProfitVnd)
            + BigInt(pnlRow.other_income_vnd || '0')
            - BigInt(pnlRow.operating_expense_vnd || '0')
          ).toString();
        }
      }

      let cashBalanceVnd = null;
      let bankBalanceVnd = null;
      let totalFundVnd = null;
      if (canViewFunds) {
        const fundRes = await client.query(
          `SELECT
             COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_vnd ELSE -amount_vnd END) FILTER (WHERE fund_type = 'cash'), 0)::text AS cash_balance_vnd,
             COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_vnd ELSE -amount_vnd END) FILTER (WHERE fund_type = 'bank'), 0)::text AS bank_balance_vnd
           FROM cash_movements
           WHERE store_id = $1`,
          [storeId]
        );
        const fundRow = fundRes.rows[0] || { cash_balance_vnd: '0', bank_balance_vnd: '0' };
        cashBalanceVnd = String(fundRow.cash_balance_vnd || '0');
        bankBalanceVnd = String(fundRow.bank_balance_vnd || '0');
        totalFundVnd = (BigInt(cashBalanceVnd) + BigInt(bankBalanceVnd)).toString();
      }

      let openShift = null;
      if (canViewShift) {
        const shiftRes = await client.query(
          `SELECT s.id, s.opened_at, opener.display_name AS opened_by_name
           FROM cash_register_sessions s
           JOIN users opener ON opener.id = s.opened_by
           WHERE s.store_id = $1 AND s.status = 'open'
           LIMIT 1`,
          [storeId]
        );
        const shiftRow = shiftRes.rows[0];
        openShift = shiftRow
          ? {
            isOpen: true,
            sessionId: shiftRow.id,
            openedAt: shiftRow.opened_at,
            openedByName: shiftRow.opened_by_name,
          }
          : {
            isOpen: false,
            sessionId: null,
            openedAt: null,
            openedByName: null,
          };
      }

      let lowStockCount = 0;
      let outOfStockCount = 0;
      const warehouseIds = allowedWarehouseIds(membership);
      if (warehouseIds === null || warehouseIds.length > 0) {
        const stockRes = await client.query(
          `WITH product_stock AS (
             SELECT p.id, p.low_stock_threshold,
                    COALESCE(SUM(b.on_hand), 0) AS total_on_hand
             FROM products p
             LEFT JOIN inventory_balances b
               ON b.store_id = p.store_id AND b.product_id = p.id
              AND ($2::uuid[] IS NULL OR b.warehouse_id = ANY($2::uuid[]))
              AND EXISTS (SELECT 1 FROM warehouses w WHERE w.store_id = b.store_id AND w.id = b.warehouse_id AND w.status = 'active')
             WHERE p.store_id = $1 AND p.status = 'active' AND p.inventory_tracked = true
             GROUP BY p.id, p.low_stock_threshold
           )
           SELECT
             COUNT(*) FILTER (WHERE total_on_hand > 0 AND total_on_hand <= low_stock_threshold)::int AS low_stock_count,
             COUNT(*) FILTER (WHERE total_on_hand = 0)::int AS out_of_stock_count
           FROM product_stock`,
          [storeId, warehouseIds]
        );
        lowStockCount = Number(stockRes.rows[0]?.low_stock_count || 0);
        outOfStockCount = Number(stockRes.rows[0]?.out_of_stock_count || 0);
      }

      let overdueDebtCount = null;
      let overdueDebtVnd = null;
      let debtorCount = null;
      let totalDebtVnd = null;
      if (canViewDebt) {
        const debtRes = await client.query(
          `WITH customer_balances AS (
             SELECT c.id, c.credit_limit_vnd,
                    COALESCE(SUM(l.debit_vnd - l.credit_vnd), 0)::bigint AS balance_vnd,
                    MAX(l.occurred_at) FILTER (WHERE l.debit_vnd > 0) AS last_debit_at
             FROM customers c
             JOIN customer_ledger_entries l ON l.store_id = c.store_id AND l.customer_id = c.id
             WHERE c.store_id = $1 AND c.status = 'active'
             GROUP BY c.id, c.credit_limit_vnd
             HAVING COALESCE(SUM(l.debit_vnd - l.credit_vnd), 0) > 0
           )
           SELECT
             COUNT(*)::int AS debtor_count,
             COALESCE(SUM(balance_vnd), 0)::text AS total_debt_vnd,
             COUNT(*) FILTER (WHERE (credit_limit_vnd IS NOT NULL AND balance_vnd > credit_limit_vnd) OR last_debit_at < now() - interval '30 days')::int AS overdue_debt_count,
             COALESCE(SUM(balance_vnd) FILTER (WHERE (credit_limit_vnd IS NOT NULL AND balance_vnd > credit_limit_vnd) OR last_debit_at < now() - interval '30 days'), 0)::text AS overdue_debt_vnd
           FROM customer_balances`,
          [storeId]
        );
        const debtRow = debtRes.rows[0] || {};
        debtorCount = Number(debtRow.debtor_count || 0);
        totalDebtVnd = String(debtRow.total_debt_vnd || '0');
        overdueDebtCount = Number(debtRow.overdue_debt_count || 0);
        overdueDebtVnd = String(debtRow.overdue_debt_vnd || '0');
      }

      let recentOrders = [];
      if (canViewRecentOrders) {
        const ordersRes = await client.query(
          `SELECT o.id, o.order_number AS number, o.customer_id,
                  COALESCE(c.name, '') AS customer_name,
                  o.status, o.total_vnd::text AS total_vnd, o.occurred_at
           FROM orders o
           LEFT JOIN customers c ON c.store_id = o.store_id AND c.id = o.customer_id
           WHERE o.store_id = $1 AND o.status <> 'voided'
           ORDER BY o.occurred_at DESC, o.id DESC
           LIMIT 5`,
          [storeId]
        );
        recentOrders = ordersRes.rows;
      }

      return {
        todayRevenueVnd,
        todayOrderCount,
        canViewFunds,
        cashBalanceVnd,
        bankBalanceVnd,
        totalFundVnd,
        canViewNetProfit,
        todayNetProfitVnd,
        actionItems: {
          openShift,
          lowStockCount,
          outOfStockCount,
          overdueDebtCount,
          overdueDebtVnd,
          debtorCount,
          totalDebtVnd,
          pendingOfflineCount: 0,
        },
        recentOrders,
      };
    });
  });
}

module.exports = { registerDashboardRoutes };
