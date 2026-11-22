(function (S) {
  'use strict';

  S.fn.pageHeading = function pageHeading(title, subtitle, actions) {
    return `<div class='page-heading'><div><h1>${S.fn.esc(title)}</h1>${subtitle ? `<p>${S.fn.esc(subtitle)}</p>` : ''}</div><div class='heading-actions'>${actions || ''}</div></div>`;
  }


  S.fn.lowStockProducts = function lowStockProducts() { return S.state.store.products.filter(function (p) { return p.inventoryTracked && p.stock <= p.minStock; }).sort(function (a, b) { return a.stock - b.stock; }); }

  S.fn.chartDays = function chartDays(days) {
    if (!S.state.analyticsData || !Array.isArray(S.state.analyticsData.days)) return [];
    return S.state.analyticsData.days.map(function (item) {
      const date = new Date(item.date + 'T12:00:00');
      return { date: item.date, label: days === 7 ? date.toLocaleDateString('vi-VN', { weekday: 'short' }) : String(date.getDate()), total: Number(item.salesVnd) || 0, orders: Number(item.orderCount) || 0 };
    });
  }


  S.fn.chartSvg = function chartSvg(days) {
    const width = 620, height = 170, left = 34, right = 8, top = 12, bottom = 26;
    const data = S.fn.chartDays(days); if (!data.length) return `<div class='empty-state'>${S.state.analyticsLoading ? 'Đang tải báo cáo…' : S.fn.esc(S.state.analyticsError || 'Chưa có dữ liệu cho khoảng thời gian này.')}</div>`; const max = Math.max(100000, Math.ceil(Math.max.apply(null, data.map(function (x) { return x.total; })) / 100000) * 100000);
    const step = (width - left - right) / Math.max(1, data.length - 1);
    const points = data.map(function (d, i) { return { x: left + i * step, y: top + (height - top - bottom) * (1 - d.total / max), value: d.total, label: d.label }; });
    const line = points.map(function (p, i) { return (i ? 'L' : 'M') + p.x + ' ' + p.y; }).join(' ');
    const area = line + ` L ${points[points.length - 1].x} ${height - bottom} L ${points[0].x} ${height - bottom} Z`;
    const grid = [0, 1, 2, 3].map(function (i) { const y = top + (height - top - bottom) * i / 3; return `<line x1='${left}' x2='${width}' y1='${y}' y2='${y}' class='chart-grid-line'/><text x='0' y='${y + 3}'>${i === 0 ? S.fn.shortMoney(max) : i === 3 ? '0' : S.fn.shortMoney(max * (3 - i) / 3)}</text>`; }).join('');
    const labels = points.map(function (p) { return `<text text-anchor='middle' x='${p.x}' y='${height - 5}'>${S.fn.esc(p.label)}</text>`; }).join('');
    const markers = points.map(function (p) { return `<circle class='chart-point' cx='${p.x}' cy='${p.y}' r='3.5'><title>${S.fn.esc(p.label)}: ${S.fn.money(p.value)}</title></circle>`; }).join('');
    return `<svg class='sales-chart' viewBox='0 0 ${width} ${height}' preserveAspectRatio='none' role='img' aria-label='Biểu đồ doanh thu ${days} ngày'><defs><linearGradient id='chartFill' x1='0' x2='0' y1='0' y2='1'><stop offset='0%' stop-color='#6aa982' stop-opacity='.24'/><stop offset='100%' stop-color='#6aa982' stop-opacity='0'/></linearGradient></defs>${grid}<path class='chart-area' d='${area}'/><path class='chart-line' d='${line}'/>${markers}${labels}</svg>`;
  }


  S.fn.topProducts = function topProducts() {
    return S.state.analyticsData && Array.isArray(S.state.analyticsData.topProducts) ? S.state.analyticsData.topProducts.slice(0, 4).map(function (item) {
      return { product: { id: item.id, name: item.name, sku: item.sku, unit: item.unit, tone: 'product-sage' }, count: Number(item.quantity_sold) || 0, revenue: Number(item.net_sales_vnd) || 0 };
    }) : [];
  }


  S.fn.dashboardMobilePrimaryActionHtml = function dashboardMobilePrimaryActionHtml() {
    if (S.fn.isProfileRouteEnabled('pos') && S.fn.canAccessRoute('pos')) return `<button class='btn btn-primary dashboard-mobile-primary' data-route='pos' data-tour-target='dashboard-mobile-primary'>＋ Tạo đơn mới</button>`;
    if (S.fn.hasPerm('manageInventory')) return `<button class='btn btn-primary dashboard-mobile-primary' data-action='receive-stock' data-tour-target='dashboard-mobile-primary'>＋ Nhập hàng</button>`;
    if (S.fn.hasPerm('editProducts')) return `<button class='btn btn-primary dashboard-mobile-primary' data-action='new-product' data-tour-target='dashboard-mobile-primary'>＋ Thêm sản phẩm</button>`;
    if (S.fn.hasPerm('recordCashbook')) return `<button class='btn btn-primary dashboard-mobile-primary' data-action='new-expense' data-tour-target='dashboard-mobile-primary'>＋ Ghi khoản thu / chi</button>`;
    return '';
  }


  S.fn.dashboardQuickActionsHtml = function dashboardQuickActionsHtml() {
    const actions = [];
    if (S.fn.isProfileRouteEnabled('pos') && S.fn.canAccessRoute('pos')) actions.push(`<button class='quick-action' data-route='pos'><span class='quick-icon'>＋</span><span class='quick-copy'><strong>Tạo đơn hàng</strong><small>Thanh toán tại quầy</small></span></button>`);
    if (S.fn.hasPerm('editProducts')) actions.push(`<button class='quick-action' data-action='new-product'><span class='quick-icon'>⌕</span><span class='quick-copy'><strong>Thêm sản phẩm</strong><small>Tạo mã hàng mới</small></span></button>`);
    if (S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook')) actions.push(`<button class='quick-action' data-action='receive-stock'><span class='quick-icon'>↙</span><span class='quick-copy'><strong>Nhập hàng</strong><small>Cập nhật tồn và giá vốn</small></span></button>`);
    if (S.fn.hasPerm('recordCashbook')) actions.push(`<button class='quick-action' data-action='new-expense'><span class='quick-icon'>↗</span><span class='quick-copy'><strong>Ghi khoản thu / chi</strong><small>Đối soát sổ quỹ</small></span></button>`);
    return actions.join('');
  }


  S.fn.buildDashboardFallback = function buildDashboardFallback() {
    const days = Array.isArray(S.state.analyticsData?.days) ? S.state.analyticsData.days : [];
    const targetDate = S.state.analyticsData?.range?.to;
    const day = targetDate ? days.find(function (item) { return item.date === targetDate; }) : days[days.length - 1];
    const summary = S.state.analyticsData?.summary || {};
    const singleDaySummary = S.state.analyticsData?.range?.days === 1 ? summary : {};
    const canFunds = S.fn.hasPerm('record_cashbook') || S.fn.hasPerm('view_reports');
    const canProfit = S.fn.hasPerm('view_reports') && S.fn.hasPerm('view_cost_price');
    let totalFundVnd = null;
    if (canFunds && S.state.financeCashbook.balances) {
      const cashBal = BigInt(String(S.state.financeCashbook.balances.cashVnd || '0'));
      const bankBal = BigInt(String(S.state.financeCashbook.balances.bankVnd || '0'));
      totalFundVnd = (cashBal + bankBal).toString();
    }
    return {
      todayNetRevenueVnd: (S.fn.hasPerm('view_reports') || S.fn.hasPerm('view_orders')) ? String(day?.salesVnd ?? singleDaySummary.netSalesVnd ?? '0') : null,
      todayOrderCount: Number(day?.orderCount ?? singleDaySummary.orderCount ?? 0),
      totalFundVnd,
      cashFundVnd: S.state.financeCashbook.balances?.cashVnd ?? null,
      bankFundVnd: S.state.financeCashbook.balances?.bankVnd ?? null,
      canViewFunds: canFunds && totalFundVnd !== null,
      todayNetProfitVnd: canProfit && singleDaySummary.netProfitVnd != null ? String(singleDaySummary.netProfitVnd) : null,
      canViewNetProfit: canProfit && singleDaySummary.netProfitVnd != null,
      actions: {
        lowStockCount: Number(S.state.inventorySummary.low || 0) + Number(S.state.inventorySummary.out || 0),
        overdueDebtCount: Number(S.state.financeSummary.customerDebtCount || 0),
        overdueDebtVnd: String(S.state.financeSummary.customerDebtVnd || '0'),
        pendingOrdersCount: S.state.store.orders.filter(o => Number(o.due || 0) > 0).length,
        openCashShiftCount: S.state.cashRegisterState.session ? 1 : 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }


  S.fn.loadDashboardPage = async function loadDashboardPage(options = {}) {
    if (!S.state.authSession || !S.state.store.id) return;
    const reqNo = ++S.state.dashboardRequestNumber;
    const session = S.state.authSession;
    const storeId = S.state.store.id;
    const current = () => reqNo === S.state.dashboardRequestNumber && S.state.authSession === session && S.state.store.id === storeId;
    if (!options.silent) {
      S.state.dashboardState.loading = true;
      S.state.dashboardState.error = '';
      if (S.state.page === 'dashboard') S.fn.render();
    }
    const auxLoads = [S.fn.loadWarehouses({ includeTransfers: false }), S.fn.loadInventoryPage('', 0, { silentLoading: true })];
    if (S.fn.hasPerm('viewOrders')) auxLoads.push(S.fn.loadOrdersPage('', 0));
    if (S.fn.hasPerm('viewFinance') || S.fn.hasPerm('recordCashbook') || S.fn.hasPerm('manageInventory')) auxLoads.push(S.fn.loadFinancePage());
    if (S.fn.hasPerm('viewReports')) auxLoads.push(S.fn.loadAnalytics(7));
    await Promise.allSettled(auxLoads);
    if (!current()) return;
    try {
      const result = await S.fn.apiRequest(`/api/stores/${encodeURIComponent(storeId)}/dashboard`, { preferFresh: true });
      if (!current()) return;
      S.state.dashboardState = {
        data: result?.dashboard || result,
        loading: false,
        error: '',
        fallback: false,
        loadedAt: Date.now(),
      };
    } catch (error) {
      if (!current()) return;
      if (error.status === 401) return S.fn.showSignedOut('Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.', 'error');
      S.state.dashboardState = {
        data: S.fn.buildDashboardFallback(),
        loading: false,
        error: '',
        fallback: true,
        loadedAt: Date.now(),
      };
    }
    if (S.state.page === 'dashboard' && current()) S.fn.render();
  }


  S.fn.renderOnboardingChecklist = function renderOnboardingChecklist(d) {
    if (S.state.onboardingDismissed || !S.fn.hasPerm('manageSettings')) return '';
    const hasStoreInfo = Boolean(S.state.store.settings.phone || S.state.store.settings.address || S.state.integrationState?.data?.bankQr?.enabled);
    const hasProducts = S.state.productTotal > 0 || S.state.store.products.length > 0;
    const invTotal = Number(S.state.inventorySummary?.total || 0);
    const invOut = Number(S.state.inventorySummary?.out || 0);
    const hasStock = invTotal > 0 && invOut < invTotal;
    const hasOrders = Boolean((d && Number(d.todayOrderCount) > 0) || S.state.store.orders.length > 0 || Number(S.state.analyticsData?.summary?.orderCount || 0) > 0);
    const steps = [
      { key: 'settings', label: '1. Cửa hàng & QR', done: hasStoreInfo, attr: `data-route='settings'` },
      { key: 'products', label: '2. Thêm hàng', done: hasProducts, attr: S.fn.hasPerm('editProducts') ? `data-action='new-product'` : `data-route='products'` },
      { key: 'inventory', label: '3. Nhập kho', done: hasStock, attr: `data-route='inventory'` },
      { key: 'pos', label: '4. Bán đơn đầu', done: hasOrders, attr: `data-route='pos'` },
    ];
    const doneCount = steps.filter(function (s) { return s.done; }).length;
    if (doneCount === steps.length) return '';
    return `<section class='onboarding-card' aria-label='Thiết lập cửa hàng mới'>
      <div class='onboarding-head'>
        <h2>Khởi tạo (${doneCount}/${steps.length})</h2>
        <button type='button' class='link-button' data-action='dismiss-onboarding'>Ẩn</button>
      </div>
      <div class='onboarding-steps'>${steps.map(function (s) {
        return `<button type='button' class='onboarding-step ${s.done ? 'is-done' : ''}' ${s.attr}><div class='onboarding-step-top'><span>${s.done ? '✓ Đã xong' : 'Cần làm'}</span><span>→</span></div><strong>${S.fn.esc(s.label)}</strong></button>`;
      }).join('')}</div>
    </section>`;
  }


  S.fn.renderDashboard = function renderDashboard() {
    const d = S.state.dashboardState.data || S.fn.buildDashboardFallback();
    const todayRevenueVnd = d.todayRevenueVnd ?? d.todayNetRevenueVnd;
    const cashBalanceVnd = d.cashBalanceVnd ?? d.cashFundVnd ?? '0';
    const bankBalanceVnd = d.bankBalanceVnd ?? d.bankFundVnd ?? '0';
    const canViewRevenue = (S.fn.hasPerm('view_reports') || S.fn.hasPerm('view_orders')) && todayRevenueVnd != null;
    const canViewFunds = d.canViewFunds === true && (S.fn.hasPerm('record_cashbook') || S.fn.hasPerm('view_reports')) && d.totalFundVnd != null;
    const canViewProfit = d.canViewNetProfit === true && S.fn.hasPerm('view_reports') && S.fn.hasPerm('view_cost_price') && d.todayNetProfitVnd != null;
    const prevDelta = S.state.analyticsData?.previousSummary?.salesGrowthPct;
    const deltaHtml = (canViewRevenue && prevDelta !== undefined && prevDelta !== null && S.charts?.renderDeltaBadge)
      ? `<div style='margin-top:6px'>${S.charts.renderDeltaBadge(prevDelta, 'so với 7 ngày trước')}</div>`
      : '';

    const cardRevenue = `<article class='real-num-card real-num-hero' data-tour-target='dashboard-revenue'>
      <span class='real-num-label'>Doanh thu thuần hôm nay</span>
      <strong class='real-num-value'>${canViewRevenue ? S.fn.esc(S.fn.moneyVndText(todayRevenueVnd)) : '—'}</strong>
      <small class='real-num-sub'>${canViewRevenue ? `${S.fn.number(d.todayOrderCount || 0)} đơn` : 'Bị hạn chế'}</small>
      ${deltaHtml}
    </article>`;

    const cardFunds = `<article class='real-num-card'>
      <span class='real-num-label'>Tiền thực trong quỹ</span>
      <strong class='real-num-value'>${canViewFunds ? S.fn.esc(S.fn.moneyVndText(d.totalFundVnd)) : 'Bị hạn chế'}</strong>
      <small class='real-num-sub'>${canViewFunds ? `Tiền mặt ${S.fn.esc(S.fn.moneyVndText(cashBalanceVnd))} · Ngân hàng ${S.fn.esc(S.fn.moneyVndText(bankBalanceVnd))}` : 'Bị hạn chế'}</small>
    </article>`;

    const cardProfit = `<article class='real-num-card'>
      <span class='real-num-label'>Lãi ròng thật hôm nay</span>
      <strong class='real-num-value'>${canViewProfit ? S.fn.esc(S.fn.moneyVndText(d.todayNetProfitVnd)) : 'Bị hạn chế'}</strong>
      ${canViewProfit ? '' : `<small class='real-num-sub'>Cần quyền Báo cáo + Giá vốn</small>`}
    </article>`;

    const act = d.actionItems || d.actions || {};
    const lowStockTotal = Number(act.lowStockCount || 0) + Number(act.outOfStockCount || 0);
    const pendingOrdersCount = act.pendingOrdersCount != null ? Number(act.pendingOrdersCount) : S.state.store.orders.filter(o => Number(o.due || 0) > 0).length;
    const openShiftsCount = act.openShift ? 1 : Number(act.openCashShiftCount || 0);
    const actionItems = [
      { action: 'dashboard-open-low-stock', label: 'Hàng sắp hết / hết hàng', count: lowStockTotal, tone: lowStockTotal > 0 ? 'is-warn' : '' },
      { action: 'dashboard-open-debts', label: 'Khách còn công nợ', count: Number(act.overdueDebtCount || 0), sub: BigInt(String(act.overdueDebtVnd || '0')) > 0n ? S.fn.moneyVndText(act.overdueDebtVnd) : '', tone: Number(act.overdueDebtCount || 0) > 0 ? 'is-danger' : '' },
      { action: 'dashboard-open-orders', label: 'Đơn chờ thu / giữ hàng', count: pendingOrdersCount, tone: pendingOrdersCount > 0 ? 'is-warn' : '' },
      { action: 'dashboard-open-shifts', label: 'Ca tiền mặt đang mở', count: openShiftsCount, tone: '' },
    ];
    const actionPanel = `<section class='dashboard-action-panel' data-tour-target='dashboard-actions' aria-label='Việc cần xử lý ngay'>
      <div class='panel-header' style='padding:0'><h2>Việc cần xử lý</h2></div>
      <div class='dashboard-action-list'>${actionItems.map(item => `<button type='button' class='dashboard-action-item ${item.tone}' data-action='${item.action}'><span><strong>${S.fn.esc(item.label)}</strong>${item.sub ? `<small style='display:block;color:var(--muted)'>${S.fn.esc(item.sub)}</small>` : ''}</span><span class='dashboard-action-count'>${S.fn.number(item.count)}</span></button>`).join('')}</div>
    </section>`;

    const quickNav = [
      S.fn.canAccessRoute('pos') ? { label: 'Bán hàng', route: 'pos', image: 'cart' } : null,
      (S.fn.hasPerm('viewFinance') || S.fn.hasPerm('recordCashbook')) ? { label: 'Thu chi', route: 'finance', image: 'wallet' } : null,
      (S.fn.hasPerm('manageInventory') || S.fn.hasPerm('recordCashbook')) ? { label: 'Nhập hàng', action: 'receive-stock', image: 'box' } : null,
      S.fn.canAccessRoute('inventory') ? { label: 'Xem kho', route: 'inventory', image: 'layers' } : null,
    ].filter(Boolean);

    const chartPanel = S.fn.hasPerm('viewReports')
      ? `<section class='panel' style='margin-bottom:18px'><div class='panel-header'><h2>Doanh thu 7 ngày</h2><button class='link-button' data-route='reports'>Xem chi tiết →</button></div>${S.charts?.renderRevenueBarChart ? S.charts.renderRevenueBarChart(S.state.analyticsData?.days || [], { height: 210 }) : ''}</section>`
      : '';

    return S.fn.pageHeading('Tổng quan', '', '') +
      `<section class='dashboard-real-numbers' aria-label='Chỉ số kinh doanh hôm nay'>${cardRevenue}${cardFunds}${cardProfit}</section>` +
      S.fn.renderOnboardingChecklist(d) +
      chartPanel +
      actionPanel +
      `<section class='daily-actions' aria-label='Việc thường làm'>${quickNav.map(item => `<button ${item.route ? `data-route='${item.route}'` : `data-action='${item.action}'`}><span>${S.fn.icon(item.image, 20)}</span><strong>${S.fn.esc(item.label)}</strong></button>`).join('')}</section>` +
      (S.fn.canAccessRoute('orders') ? `<section class='panel'><div class='panel-header'><h2>Đơn mới nhất</h2><button class='link-button' data-route='orders'>Xem tất cả →</button></div><div class='activity-list'>${(S.state.store.orders.slice(0, 3).map(order => `<button class='activity-item recent-order' data-action='order-detail' data-id='${S.fn.esc(order.id)}'><span class='activity-mark'>${S.fn.icon('receipt', 20)}</span><span class='activity-text'><strong>${S.fn.esc(order.number)}</strong><small>${S.fn.esc(order.customerName || 'Khách lẻ')} · ${S.fn.humanDate(order.createdAt, true)}</small></span><strong>${S.fn.money(order.total)}</strong></button>`).join('') || `<div class='empty-state'>Chưa có đơn hàng.</div>`)}</div></section>` : '');
  }

})(window.Slink = window.Slink || { dom: {}, c: {}, state: {}, fn: {}, charts: {} });
